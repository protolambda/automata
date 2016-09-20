// See LICENSE, author: @protolambda


var StatsJS = require("stats.js");
var fs = require("fs");
var Vec2 = require("victor");
var $ = require("jquery");


function getShader(gl, src, type) {
  var shader;
  if (type === gl.FRAGMENT_SHADER) shader = gl.createShader(gl.FRAGMENT_SHADER);
  else if (type === gl.VERTEX_SHADER) shader = gl.createShader(gl.VERTEX_SHADER);
  else return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === 0) {
    var errLog = gl.getShaderInfoLog(shader);
    console.error("WebGL: Error compiling shader:", errLog);
    throw new Error("WebGL: Error compiling shader:" + errLog);
  }
  return shader;
}


class Automaton {


  constructor (canvas, zoom, p, torus, automaton, generator) {

    var gl;

    if (!window.WebGLRenderingContext) {
      window.alert("Your browser does not support WebGL. See http://get.webgl.org");
      return;
    }
    try {
      gl = this.gl = canvas.getContext("webgl", {antialias: false}) || canvas.getContext("experimental-webgl", {antialias: false});
    } catch (e) {
      console.log("No webGL" + e);
    }

    if (!gl) {
      window.alert("Can't get WebGL");
      return;
    }


    this.stats = StatsJS();
    this.stats.setMode(0); // 0: fps, 1: ms
    this.stats.domElement.id = "stats";

    this.zoom = zoom || 0;

    this.setTorusMode(torus);

    gl.disable(gl.DEPTH_TEST);



    var fragShadersSrc = new Map([
      ["game_of_life", fs.readFileSync(__dirname + "/glsl/game_of_life.frag")],
      ["day_and_night", fs.readFileSync(__dirname + "/glsl/day_and_night.frag")],
      ["no_death", fs.readFileSync(__dirname + "/glsl/no_death.frag")],
      ["highlife", fs.readFileSync(__dirname + "/glsl/highlife.frag")],
      ["seeds", fs.readFileSync(__dirname + "/glsl/seeds.frag")],
      ["replicator", fs.readFileSync(__dirname + "/glsl/replicator.frag")],
      ["copy", fs.readFileSync(__dirname + "/glsl/copy.frag")]
    ]);

    var vertShadersSrc = new Map([
      ["quad", fs.readFileSync(__dirname + "/glsl/quad.vert")]
    ]);

    this.shaders = {};

    fragShadersSrc.forEach((v, k, m) => this.shaders[k] = getShader(gl, v, gl.FRAGMENT_SHADER));
    vertShadersSrc.forEach((v, k, m) => this.shaders[k] = getShader(gl, v, gl.VERTEX_SHADER));

    this.automata = new Map([
      ["game_of_life", [this.shaders["game_of_life"], this.shaders["quad"]]],
      ["day_and_night", [this.shaders["day_and_night"], this.shaders["quad"]]],
      ["no_death", [this.shaders["no_death"], this.shaders["quad"]]],
      ["highlife", [this.shaders["highlife"], this.shaders["quad"]]],
      ["seeds", [this.shaders["seeds"], this.shaders["quad"]]],
      ["replicator", [this.shaders["replicator"], this.shaders["quad"]]]
    ]);

    function loadProgram(...programShaders){
      let program = gl.createProgram();
      programShaders.forEach((v, i) => { console.log("shader: "+v+" "+i); gl.attachShader(program, v)});

      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        let errLog = gl.getProgramInfoLog(program);
        console.error(`WebGL: Error linking shader program (${k}):`, errLog);
        throw new Error(`WebGL: Error linking shader program (${k}):` + errLog);
      }
      return program;
    }

    this.programs = {};

    this.automata.forEach((v, k, m) => this.programs[k] = loadProgram(...v));

    this.programs.copy = loadProgram(this.shaders.copy, this.shaders.quad);



    this.currentAutomaton = automaton || "game_of_life";

    var quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]), gl.STATIC_DRAW);

    this.buffers = {
      quad: quadBuf
    };

    this.textures = {
      front: this.texture(torus),
      back: this.texture(torus)
    };

    this.framebuffers = {
      step: gl.createFramebuffer()
    };

    this.generators = {
      random: (x, y, p) => Math.random() < p,
      cells: (x, y) => Math.cos(x*10.0) > Math.sin(y*10.0),
      XmodY: (x, y) => x % y === 0,
      arcs: (x, y) => (x % y) & (x ^ y) > 2,
      stable: (x, y) =>  (x ^ y) % 8 == 0,
      chess: (x, y) =>  Math.abs(x ^ y) % 8 < 4,
      blocks: (x, y) =>  (((x ^ y) > ~x) && y <= 0),
      stable2: (x, y) =>  (x ^ y / 3) % 2,
      prime: (x, y) => Automaton.isPrime(x),
      blocks2: (x, y) => (x ^ y)+x >= 0,
      xormod3: (x, y) => (x ^ y) % 3 == 0,
      ulam: (x, y) => Automaton.isPrime(Automaton.ulam(x, y)),
      XORprime: (x, y) => Automaton.isPrime(Math.abs(x) ^ Math.abs(y)),
      SierpinskiCarpet: (x, y) => Automaton.sierpinskiCarpet(x, y),
      endlessSierpinski: (x, y) => (x ^ y) + x - y == 0,
      sierpinskiLevel10: (x, y) => ((x ^ y) + x - y) % 1024 == 0,
      sierpinskiMountains: (x, y) => ((x ^ y) + y - x) % y == 0
    };

    this.currentGenerator = generator || "XORprime";

    this.p = p;

    this.generateState(p);
  }

  static sierpinskiCarpet(x, y){
    return !(x < 1 && y < 1)
    && ( ((x % 3 == 1) && (y % 3 == 1))
        || this.sierpinskiCarpet(Math.floor(x/3), Math.floor(y/3))
    );
  }

  static ulam(x, y) {
    let m = Math.max(Math.abs(x), Math.abs(y));
    if(y == m) return 4*m*(m-1) + 3*m - x + 1;
    if(x == m) return 4*m*(m-1) + m + y + 1;
    if(y == -m) return 4*m*(m-1) + 7*m + x + 1;
    else return 4*m*(m-1) + 5*m - y + 1;
  }

  static isPrime(n) {
    if (isNaN(n) || !isFinite(n) || n%1 || n<2) return false;
    return (n==Automaton.leastFactor(n));
  }

  static leastFactor(n){
    if (isNaN(n) || !isFinite(n)) return NaN;
    if (n==0) return 0;
    if (n%1 || n*n<2) return 1;
    if (n%2==0) return 2;
    if (n%3==0) return 3;
    if (n%5==0) return 5;
    var m = Math.sqrt(n);
    for (var i=7;i<=m;i+=30) {
      if (n%i==0)      return i;
      if (n%(i+4)==0)  return i+4;
      if (n%(i+6)==0)  return i+6;
      if (n%(i+10)==0) return i+10;
      if (n%(i+12)==0) return i+12;
      if (n%(i+16)==0) return i+16;
      if (n%(i+22)==0) return i+22;
      if (n%(i+24)==0) return i+24;
    }
    return n;
  }

  resetTranslation(){
    this.tx = - (this.statesize.x >> 1);
    this.ty = - (this.statesize.y >> 1);
  }

  resize(w, h){
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    this.viewsize = new Vec2(w, h);
    this.statesize = new Vec2(w >> this.zoom, h >> this.zoom);

    this.resetTranslation();
  }

  setTorusMode(torus){
    //the width and height need to be a power of 2 for the torus shape (gl.REPEAT)
    var w = (torus ? 1 << (window.innerWidth.toString(2).length - 1) : window.innerWidth),
      h = (torus ? 1 << (window.innerHeight.toString(2).length - 1) : window.innerHeight);
    this.resize(w, h);
  }

  texture(torus) {
    var gl = this.gl;
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    //gl.REPEAT with size as power of 2 for torus behaviour, gl.CLAMP_TO_EDGE for edge behaviour with any size
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, torus ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, torus ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      this.statesize.x, this.statesize.y,
      0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
  }

  setState(state) {
    var gl = this.gl;
    var rgba = new Uint8Array(this.statesize.x * this.statesize.y * 4);
    for (var i = 0; i < state.length; i++) {
      var ii = i * 4;
      rgba[ii] = rgba[ii + 1] = rgba[ii + 2] = state[i] ? 255 : 0;
      rgba[ii + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.textures.front);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
      this.statesize.x, this.statesize.y,
      gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    return this;
  }


  getState() {
    var gl = this.gl, w = this.statesize.x, h = this.statesize.y;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.step);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.textures.front, 0);
    var rgba = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    var state = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) {
      state[i] = rgba[i * 4] > 128 ? 1 : 0;
    }
    return state;
  }

  generateState(p) {
    var size = this.statesize.x * this.statesize.y;
    if(!p) p = 0.5;
    var rand = new Uint8Array(size);
    var generator = this.generators[this.currentGenerator];

    for (var y = 0, x, i = 0; y < this.statesize.y; y++) {
      for(x = 0; x < this.statesize.x; x++, i++){
        rand[i] = generator.call(this, x + this.tx, y + this.ty, p);
      }
    }
    this.setState(rand);
    return this;
  }

  clearState() {
    this.setState(new Uint8Array(this.statesize.x * this.statesize.y));
    return this;
  }

  swapTextures() {
    var tmp = this.textures.front;
    this.textures.front = this.textures.back;
    this.textures.back = tmp;
    return this;
  }

  automatonStep() {

    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.step);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.textures.back, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.front);
    gl.viewport(0, 0, this.statesize.x, this.statesize.y);

    let automaton = this.programs[this.currentAutomaton];

    gl.useProgram(automaton);

    if(!automaton.golQuadBufLoc) automaton.golQuadBufLoc = gl.getAttribLocation(automaton, "quad");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
    gl.enableVertexAttribArray(automaton.golQuadBufLoc);
    gl.vertexAttribPointer(automaton.golQuadBufLoc, 2, gl.FLOAT, false, 0, 0);

    if(!automaton.golStateLoc) automaton.golStateLoc = gl.getUniformLocation(automaton, "state");
    gl.uniform1i(automaton.golStateLoc, 0);

    if(!automaton.golScaleLoc) automaton.golScaleLoc = gl.getUniformLocation(automaton, "scale");
    gl.uniform2f(automaton.golScaleLoc, this.statesize.x, this.statesize.y);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.swapTextures();

    return this;
  }

  draw() {
    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.front);
    gl.viewport(0, 0, this.viewsize.x, this.viewsize.y);

    gl.useProgram(this.programs.copy);

    if(!this.copyQuadBufLoc) this.copyQuadBufLoc = gl.getUniformLocation(this.programs.copy, "state");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quad);
    gl.enableVertexAttribArray(this.copyQuadBufLoc);
    gl.vertexAttribPointer(this.copyQuadBufLoc, 2, gl.FLOAT, false, 0, 0);

    if(!this.copyStateLoc) this.copyStateLoc = gl.getUniformLocation(this.programs.copy, "state");
    gl.uniform1i(this.copyStateLoc, 0);

    if(!this.copyScaleLoc) this.copyScaleLoc = gl.getUniformLocation(this.programs.copy, "scale");
    gl.uniform2f(this.copyScaleLoc, this.viewsize.x, this.viewsize.y);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return this;
  }

  setPixelState(x, y, state) {
    var gl = this.gl,
      v = state * 255;
    gl.bindTexture(gl.TEXTURE_2D, this.textures.front);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, 1, 1,
      gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([v, v, v, 255]));
  }


  update(){
    this.stats.begin();
    this.automatonStep();
    this.draw();
    this.stats.end();
    if(this.running) window.requestAnimationFrame((t)=>this.update());
  }

  start() {
    if (!this.running) {
      this.running = true;
      window.requestAnimationFrame((t)=>this.update());
    }
    return this;
  }

  stop() {
    this.running = false;
    return this;
  }

  toggle() {
    if(this.running) this.stop();
    else this.start();
  }

  mouseToWorld(event) {
    var $target = $(event.target),
      offset = $target.offset(),
      border = 1,
      x = event.pageX - offset.left - border,
      y = $target.height() - (event.pageY - offset.top - border);
    return new Vec2(x >> this.zoom, y >> this.zoom);
  }

  initControls() {
    var $canvas = $(this.gl.canvas);
    this.drag = null;
    $canvas.on("mousedown", (event) => {
      this.drag = event.which;
      var pos = this.mouseToWorld(event);
      if(event.shiftKey){
        var res = this.generators[this.currentGenerator].call(this, pos.x + this.tx, pos.y + this.ty, this.p);
        var x = pos.x + this.tx;
        var y = pos.y + this.ty;
        console.log(`Debug: pos: (${pos.x};${pos.y}); translated pos: (${x};${y}); value: ${res}`);
      } else this.setPixelState(pos.x, pos.y, this.drag === 1);
      this.draw();
    });
    $canvas.on("mouseup", () => this.drag = null);
    $canvas.on("mousemove", (event) => {
      if (this.drag) {
        var pos = this.mouseToWorld(event);
        this.setPixelState(pos.x, pos.y, this.drag === 1);
        this.draw();
      }
    });
    $canvas.on("contextmenu", (event) => {
      event.preventDefault();
      return false;
    });
    /*
            [left mouse]: fill cell (draw)
    [middle/right mouse]: clear cell (erase)
    [up/down/left/right]: shift world (regenerates!)
                [delete]: clear state
                     [r]: (re)generate
                 [space]: pause/unpause
                     [n]: one step
                     [s]: save state
           [s] + [shift]: load state
                     [h]: hide/show gui
     */
    $(document).on("keyup", (event) => {
      switch (event.which) {
        case 39: // right arrow
          this.tx += this.statesize.x >> 2;
          this.generateState(this.p);
          this.draw();
          break;
        case 37: // left arrow
          this.tx -= this.statesize.x >> 2;
          this.generateState(this.p);
          this.draw();
          break;
        case 38: // up arrow
          this.ty += this.statesize.x >> 2;
          this.generateState(this.p);
          this.draw();
          break;
        case 40: // down arrow
          this.ty -= this.statesize.x >> 2;
          this.generateState(this.p);
          this.draw();
          break;
        case 46: // delete
          this.clearState();
          this.draw();
          break;
        case 82: // r
          this.generateState(this.p);
          this.draw();
          break;
        case 32: // space
          this.toggle();
          break;
        case 78: // n
          this.automatonStep();
          this.draw();
          break;
        case 83: // s
          if (event.shiftKey) {
            if (this._save) this.setState(this._save);
          } else {
            this._save = this.getState();
          }
          break;
      }
    });
  }

}


export {Automaton};
