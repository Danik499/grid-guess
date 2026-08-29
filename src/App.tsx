import { useEffect, useState } from "react";
import "./App.css";
import { geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3";
import world from "./custom.geo.json";

function App() {
  const [path, setPath] = useState("");

  useEffect(() => {
    const projection = geoOrthographic();

    const geoGenerator = geoPath().projection(projection);

    const pathString = geoGenerator(world as GeoPermissibleObjects);

    // setPath(geoGenerator(Switzerland.features[0]));
    setPath(pathString!);
  }, []);

  console.log(path);

  return (
    <div>
      <div className="border-amber-900 border-2 border-solid">
        <svg viewBox="0 0 1000 1000">
          <path d={path} />
        </svg>
      </div>
    </div>
  );
}

export default App;
