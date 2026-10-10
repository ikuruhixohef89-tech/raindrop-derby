// Entry for the vendored Three.js bundle. Only the classes the game uses are exported, so the bundler can drop the rest.
export {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, InstancedBufferAttribute,
  IcosahedronGeometry, PlaneGeometry, BoxGeometry, ShapeGeometry, ExtrudeGeometry, Shape, Path,
  SphereGeometry, CylinderGeometry, CircleGeometry, BufferGeometry, BufferAttribute, Points,
  ShaderMaterial, MeshStandardMaterial, MeshBasicMaterial,
  CanvasTexture, DataTexture, Color, Vector2, Vector3, Object3D, DynamicDrawUsage,
  AmbientLight, DirectionalLight, PointLight, HemisphereLight,
  RepeatWrapping, ClampToEdgeWrapping, LinearFilter, NearestFilter, LinearMipmapLinearFilter,
  SRGBColorSpace, AdditiveBlending, NormalBlending, RGBAFormat, UnsignedByteType, DoubleSide, FrontSide, BackSide, MathUtils,
  REVISION,
} from 'three';
