// See LICENSE, author: @protolambda

"use strict";


import * as AutomatonLib from "./lib.js";


var dat = require("exdat");
var $ = require("jquery");


$(document).ready(function() {
  var $canvas = $("#main-canvas");

  var gol = new AutomatonLib.Automaton($canvas[0], 0, 0.5, false).draw().start();

  document.body.appendChild( gol.stats.domElement );

  var gui = new dat.GUI();


  var f0 = gui.addFolder("Cellular Automata");
  f0.add(gol, "currentAutomaton", [...(gol.automata.keys())]);



  var f1 = gui.addFolder("Position generator");
  f1.add(gol, "currentGenerator", Object.keys(gol.generators));
  f1.add(gol, "p", 0.0, 1.0);

  var uiControls = {
    toggleFPS: ()=>$("#stats").toggle(),
    keyInfo: ()=>$("#key-info").toggle()
  };

  var f2 = gui.addFolder("controls");
  f2.add(uiControls, "toggleFPS");
  f2.add(uiControls, "keyInfo");

  f1.open();

  gol.initControls();
});

/* Don't scroll on spacebar. */
$(window).on("keydown", (event) => event.keyCode !== 32);


