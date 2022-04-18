1. [ ] Implement draw pipeline in with canvas2dbuffers into projector-2d
2. [ ] Implement draw pipeline in with texturebuffers into webgl-2d
3. [ ] Implement frameblending in webgl
4. [ ] ? Retrieve canvas pixels from projector in webgl and 2d mode (is 256x256 enough?)
5. [ ] ? Implement webgl getPixel in bar detection (also determined by the webgl setting)


optimiations:
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices?retiredLocale=nl#avoid_invalidating_fbo_attachment_bindings
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices?retiredLocale=nl#use_invalidateframebuffer
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices?retiredLocale=nl#use_texstorage_to_create_textures
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices?retiredLocale=nl#use_mipmaps_for_any_texture_youll_see_in_3d
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices?retiredLocale=nl#prefer_builtins_instead_of_building_your_own
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices?retiredLocale=nl#always_enable_vertex_attrib_0_as_an_array