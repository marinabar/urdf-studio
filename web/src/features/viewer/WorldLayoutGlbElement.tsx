import { Html } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createWorldLayoutElementVisual,
  resolveWorldLayoutElementScale,
  setWorldLayoutElementHighlighted,
} from "@/features/viewer/worldLayoutElementRuntime";
import type { WorldLayoutElementConfig } from "@/features/viewer/worldLayoutEnvironmentConfig";

export type WorldLayoutElementPoseOverride = {
  position: [number, number, number];
  rotation?: [number, number, number];
};

export type WorldLayoutElementBoundsSnapshot = {
  bounds: THREE.Box3;
  physicsCenterXyz: [number, number, number];
  physicsRotationRpyRad: [number, number, number];
  physicsSizeXyz: [number, number, number];
  visualOriginXyz: [number, number, number];
};

type WorldLayoutGlbElementProps = {
  config: WorldLayoutElementConfig;
  isSelected: boolean;
  poseOverride?: WorldLayoutElementPoseOverride;
  onBoundsChange: (
    id: string,
    snapshot: WorldLayoutElementBoundsSnapshot | null
  ) => void;
  onHoverChange: (id: string | null) => void;
  onSelect: (id: string) => void;
};

const worldLayoutGltfCache = new Map<string, Promise<GLTF>>();

const loadWorldLayoutGltf = (url: string): Promise<GLTF> => {
  const cached = worldLayoutGltfCache.get(url);
  if (cached) return cached;
  const loader = new GLTFLoader();
  const promise = loader.loadAsync(url).catch((error: unknown) => {
    worldLayoutGltfCache.delete(url);
    throw error;
  });
  worldLayoutGltfCache.set(url, promise);
  return promise;
};

const toTuple = (value: THREE.Vector3): [number, number, number] => [
  value.x,
  value.y,
  value.z,
];

const MATERIAL_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "envMap",
  "lightMap",
] as const;

const collectMaterialTextures = (material: THREE.Material): THREE.Texture[] => {
  const textures: THREE.Texture[] = [];
  const materialRecord = material as unknown as Record<string, unknown>;
  MATERIAL_TEXTURE_KEYS.forEach((key) => {
    const texture = materialRecord[key];
    if (texture instanceof THREE.Texture) {
      textures.push(texture);
    }
  });
  return textures;
};

const waitForTextureImageDecode = async (texture: THREE.Texture): Promise<void> => {
  const image = texture.image as { decode?: () => Promise<void> } | undefined;
  if (typeof image?.decode !== "function") return;
  try {
    await image.decode();
  } catch {
    // A failed decode should not block rendering; the renderer can still fall back normally.
  }
};

const prepareWorldLayoutElementForRender = async (
  root: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera
): Promise<void> => {
  const textureSet = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      collectMaterialTextures(material).forEach((texture) => textureSet.add(texture));
    });
  });

  const textures = Array.from(textureSet);
  await Promise.all(textures.map(waitForTextureImageDecode));

  const rendererWithTextureInit = renderer as THREE.WebGLRenderer & {
    initTexture?: (texture: THREE.Texture) => void;
  };
  textures.forEach((texture) => {
    rendererWithTextureInit.initTexture?.(texture);
  });
  renderer.compile(root, camera);
};

const buildBoundsSnapshot = (
  wrapper: THREE.Group,
  physicsSizeXyz: [number, number, number],
  physicsCenterLocalXyz?: [number, number, number]
): WorldLayoutElementBoundsSnapshot | null => {
  wrapper.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(wrapper);
  if (bounds.isEmpty()) return null;
  const center = new THREE.Vector3();
  if (physicsCenterLocalXyz) {
    center
      .set(...physicsCenterLocalXyz)
      .applyQuaternion(wrapper.quaternion)
      .add(wrapper.position);
  } else {
    bounds.getCenter(center);
  }
  return {
    bounds,
    physicsCenterXyz: toTuple(center),
    physicsRotationRpyRad: [
      wrapper.rotation.x,
      wrapper.rotation.y,
      wrapper.rotation.z,
    ],
    physicsSizeXyz,
    visualOriginXyz: [
      wrapper.position.x,
      wrapper.position.y,
      wrapper.position.z,
    ],
  };
};

export const WorldLayoutGlbElement = ({
  config,
  isSelected,
  poseOverride,
  onBoundsChange,
  onHoverChange,
  onSelect,
}: WorldLayoutGlbElementProps) => {
  const renderer = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [physicsSizeXyz, setPhysicsSizeXyz] = useState<
    [number, number, number] | null
  >(null);
  const [physicsCenterLocalXyz, setPhysicsCenterLocalXyz] = useState<
    [number, number, number] | undefined
  >(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 0.22,
        metalness: 0.05,
        roughness: 0.42,
      }),
    []
  );

  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);

  useEffect(() => {
    if (!scene) return;
    setWorldLayoutElementHighlighted(scene, isSelected, selectedMaterial);
    return () => {
      setWorldLayoutElementHighlighted(scene, false, selectedMaterial);
    };
  }, [isSelected, scene, selectedMaterial]);

  useEffect(() => {
    let disposed = false;
    const instanceMaterials: THREE.Material[] = [];
    setScene(null);
    setLoadError(null);
    onBoundsChange(config.asset.id, null);

    void loadWorldLayoutGltf(config.asset.url)
      .then(async (gltf) => {
        if (disposed) return;
        const visual = createWorldLayoutElementVisual(gltf.scene, config.asset);
        if (config.materialColor) {
          visual.scene.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            const material = new THREE.MeshStandardMaterial({
              color: config.materialColor,
              emissive: config.materialColor,
              emissiveIntensity: 0.24,
              metalness: 0.05,
              roughness: 0.38,
            });
            child.material = material;
            instanceMaterials.push(material);
          });
        }
        const metricScale = resolveWorldLayoutElementScale(
          config.asset.realWorldHeightM,
          visual.size.y
        );
        const wrapper = new THREE.Group();
        wrapper.name = config.asset.name;
        wrapper.position.set(...config.position);
        wrapper.rotation.set(...config.rotation);
        const wrapperScale: [number, number, number] = [
          metricScale * config.scale[0],
          metricScale * config.scale[1],
          metricScale * config.scale[2],
        ];
        wrapper.scale.set(...wrapperScale);
        wrapper.add(visual.scene);
        wrapper.userData.worldLayoutElementId = config.asset.id;
        wrapper.userData.worldLayoutElementMetadata = config.asset.metadataUrl ?? null;
        const nextPhysicsSizeXyz: [number, number, number] = config.collisionProxy
          ? [
              config.collisionProxy.sizeXyz[0] * wrapperScale[0],
              config.collisionProxy.sizeXyz[1] * wrapperScale[1],
              config.collisionProxy.sizeXyz[2] * wrapperScale[2],
            ]
          : [
              visual.size.x * wrapperScale[0],
              visual.size.y * wrapperScale[1],
              visual.size.z * wrapperScale[2],
            ];
        const nextPhysicsCenterLocalXyz: [number, number, number] | undefined =
          config.collisionProxy
            ? [0, nextPhysicsSizeXyz[1] / 2, 0]
            : undefined;
        const snapshot = buildBoundsSnapshot(
          wrapper,
          nextPhysicsSizeXyz,
          nextPhysicsCenterLocalXyz
        );
        await prepareWorldLayoutElementForRender(wrapper, renderer, camera);
        if (disposed) return;
        onBoundsChange(config.asset.id, snapshot);
        setPhysicsSizeXyz(nextPhysicsSizeXyz);
        setPhysicsCenterLocalXyz(nextPhysicsCenterLocalXyz);
        setScene(wrapper);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        onBoundsChange(config.asset.id, null);
      });

    return () => {
      disposed = true;
      onBoundsChange(config.asset.id, null);
      setScene(null);
      setPhysicsSizeXyz(null);
      setPhysicsCenterLocalXyz(undefined);
      instanceMaterials.forEach((material) => material.dispose());
    };
  }, [camera, config, onBoundsChange, renderer]);

  useEffect(() => {
    if (!scene || !physicsSizeXyz) return;
    scene.position.set(...(poseOverride?.position ?? config.position));
    scene.rotation.set(...(poseOverride?.rotation ?? config.rotation));
    const snapshot = buildBoundsSnapshot(
      scene,
      physicsSizeXyz,
      physicsCenterLocalXyz
    );
    onBoundsChange(config.asset.id, snapshot);
  }, [
    config.asset.id,
    config.position,
    config.rotation,
    onBoundsChange,
    physicsCenterLocalXyz,
    physicsSizeXyz,
    poseOverride,
    scene,
  ]);

  if (scene) {
    return (
      <primitive
        object={scene}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(config.asset.id);
        }}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHoverChange(config.asset.id);
        }}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHoverChange(config.asset.id);
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHoverChange(null);
        }}
      />
    );
  }
  if (!loadError) return null;

  return (
    <Html center position={config.position}>
      <div className="rounded-md border border-destructive/50 bg-background/95 px-2 py-1 text-[10px] text-destructive shadow">
        {`${config.asset.name} failed: ${loadError}`}
      </div>
    </Html>
  );
};
