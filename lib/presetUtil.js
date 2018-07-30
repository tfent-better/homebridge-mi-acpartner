/*INPUT_DATA
  "model": "origin model data get from AC sync function",
  "power": "this.Active",
  "mode": "mode must pre-convert to command",
  "tempera": "temperature basic on mode"
  "SwingMode": "this.SwingMode",
  "RotationSpeed": "this.RotationSpeed",
  "LightState": "this.LightState",
}*/
const presets = require('../presets.json');

const defaultValue = presets.default;
const globalValue = presets.extra;
let tempera_offset = 0;

module.exports = function (model, pw, md, tp, sw, rot, li) {
  let __codeTmp = '0100006012$a1$1$sp1$$sw1$1$t1$$a1$10023CB2601002$a2$030$t2$$sw2$$s$00000000$c$'
  /*
  ​​​​​0100006012$a1$1$sp1$$sw1$1$t1$$a1$10023CB2601002$a2$030$t2$$sw2$$s$00000000$c$​​​​​
  1[0]: $a1$ active
  2[0]: $sp1$ speed : 3=>2 2=>1 1=>0
  2[1]: $sw1$ swing : on=>0 off=>1
  3[0]: $t1$ temp: 30~17 e~1
  3[1]: $a1$ active
  4[0]: $a2$ active: on=>7 off=>3
  5[0]: $t2$ temp: 30~17 1~e
  5[1]: $sw2$ swing: on=>3 off=>0
  5[2]: $s$ swing & speed: ____
              swing: on=> 0b1000 off=> 0b0000
              speed: 1=> 0b010 2=> 0b011 3=>0b101
  6:  _t = temp: 30~27~17 0xa~0xd~
      _sw= swing: on=> 0x38 off=> 0
      _sp= speed: 1=> 0b010 2=> 0b011 3=>101
  */
  let $a1$, $sp1$, $sw1$, $t1$, $a2$, $t2$, $sw2$, $s$, $c$

  $a1$ = pw ? '1' : '0'
  $sp1$ = '2' //['0', '1', '2', '2'][rot] || '0'
  $sw1$ = sw ? '0' : '1'
  $t1$ = (0xe - (30 - tp)).toString(16)
  $a2$ = pw ? '7' : '3'
  if (pw) {
    let _rot = 5 //([2, 3, 5, 5][rot] || 2)
    $t2$ = (0xe - (+tp - 17)).toString(16)
    $sw2$ = sw ? '3' : '0'
    $s$ = ((sw ? 8 : 0) + _rot).toString(16)
    $c$ = ((64 + (30 - tp)) + (sw ? 0x38 : 0) + _rot).toString(16)
  } else {
    $t2$ = '7'
    $sw2$ = '3'
    $s$ = '8'
    $c$ = '7A'
  }

  return __codeTmp
    .replace('$a1$', $a1$)
    .replace('$a1$', $a1$)
    .replace('$sp1$', $sp1$)
    .replace('$sw1$', $sw1$)
    .replace('$t1$', $t1$)
    .replace('$a2$', $a2$)
    .replace('$t2$', $t2$)
    .replace('$sw2$', $sw2$)
    .replace('$s$', $s$)
    .replace('$c$', $c$)
}

// This function replace select-name then add a tempera_offset after.
function preset_mode_util(replace_name, mode_str, origin_mode_str) {
  let _code = null;
  if (globalValue[replace_name][mode_str + "_fix"] !== undefined) {
    //Replace mode_fix code
    _code = globalValue[replace_name][mode_str + "_fix"].toUpperCase();
  } else {
    if (!globalValue[replace_name][mode_str]) {
      if (globalValue[replace_name][origin_mode_str]) {
        //Replace origin mode code
        _code = parseInt(globalValue[replace_name][origin_mode_str], 16);
      } else {
        //Replace origin mode_fix code
        _code = parseInt(globalValue[replace_name][origin_mode_str + "_fix"], 16);
      }
    } else {
      //Replace mode code
      _code = parseInt(globalValue[replace_name][mode_str], 16);
    }
    _code = _code + tempera_offset;
    _code = _code.toString(16).substr(-1).toUpperCase();
  }
  return _code;
}