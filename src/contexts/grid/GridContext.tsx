import { createContext, type PropsWithChildren } from "react";

const GridContext = createContext(null);

function Grid({ children }: PropsWithChildren) {
  return <GridContext.Provider value={null}>{children}</GridContext.Provider>;
}

export default Grid;
