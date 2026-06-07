# ship_crane URDF (2-DOF)

Generated from `../0-ship-crane.glb` by `scripts/crane_to_urdf.py`.

The source GLB is a single solid mesh, so it was split geometrically into two
links. Meshes are scaled to **metres** (crane ~50 m tall, from `object.json`)
and the model sits with its base on the ground plane (z = 0).

## Kinematic tree
```
world
  └─ anchor  (fixed)                  ── bolts the crane down (no free-fall/tip)
     base_link
       └─ base_yaw  (continuous, axis +Z)  ── turntable: spins the whole crane
            └─ tower_link        (legs, portal, machinery house, mast base)
                 └─ boom_luff  (revolute, axis +X, limits [-0.6, 1.2] rad)
                      └─ boom_link   (the long jib/boom + forestays)
```

The crane is **Z-up** (URDF/ROS convention) and grounded on its **wheels** at
z = 0. A thin stray leg that hung ~13 m below the wheels has been trimmed so the
wheels are the lowest geometry and the crane rests flat in a physics sim.

- **`base_yaw`** – Joint 2: rotates the entire crane about the vertical axis at
  the base centre, like it's on a spinning platform.
- **`boom_luff`** – Joint 1: luffs the boom up/down about its heel
  (`origin xyz="0.047 0.401 25.042"` in the tower frame). 0 rad = rest pose as
  in the GLB; positive raises the boom.

Map a robot-arm joint position straight onto either joint value.

## Files
- `ship_crane.urdf` – the robot description.
- `meshes/tower.glb`, `meshes/boom.glb` – textured visual/collision meshes.
- `meshes/material.mtl`, `meshes/material_0.png` – shared blue-paint texture.

## Notes
- The `anchor` fixed joint keeps the base planted. In PyBullet you can instead
  load with `useFixedBase=True` (the `world` link is harmless either way).
- Visual and collision use the same full-res meshes. For physics you may want a
  simplified / convex-decomposed collision mesh.
- Mass (800 t total) is split by surface area; inertias are box approximations.
- Re-generate or re-tune with `python3 scripts/crane_to_urdf.py`:
  `SPLIT_Y`/`SPLIT_Z`/`PIVOT` set where the boom is cut & hinged;
  `TRIM_Z` trims geometry below the wheels; `GROUND_Z` sets the ground level.
