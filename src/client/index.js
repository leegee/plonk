
import Plonk from "./Plonk";

window.addEventListener('click', () => {
  new Plonk({
    element: 'app-container',
    xcontrolsElement: 'xcontrols',
    wsUri: 'ws://127.0.0.1:3000/'
  });
}, {
  once: true
});
