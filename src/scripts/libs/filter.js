let existingSrcCanvas;
let texture;
let canvas;

export default (srcCanvas, srcCtx, filters) => {
  if(!window.fx) return

  if(
    existingSrcCanvas !== srcCanvas
  ) {
    canvas = fx.canvas();
    existingSrcCanvas = srcCanvas;
    texture = canvas.texture(srcCanvas);
  }

  texture.loadContentsOf(srcCanvas);
  let filteredCanvas = canvas.draw(texture);
  filters.forEach(([filter, args]) => {
    filteredCanvas = filteredCanvas[filter](...args);
  });
  filteredCanvas.update();
  srcCtx.drawImage(canvas, 0 , 0);
}