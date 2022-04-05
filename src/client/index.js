
import Plonk from "./Plonk";

const plonk = new Plonk({
  element: 'app-container',
  xcontrolsElement: 'xcontrols',
  wsUri: 'ws://127.0.0.1:3000/'
});

plonk.run();

