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
  canvas.draw(texture);

  filters.forEach(([filter, args]) => {
    canvas[filter](...args);
  });
  canvas.update();

  srcCtx.drawImage(canvas, 0, 0);
}