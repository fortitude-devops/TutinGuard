// leaflet.heat is a classic plugin that expects a global L; this module runs before it is imported.
import L from 'leaflet';
(window as unknown as { L: typeof L }).L = L;
export default L;
