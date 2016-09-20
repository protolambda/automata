#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D state;
uniform vec2 scale;

int get_state(vec2 offset) {
    return int(texture2D(state, (gl_FragCoord.xy + offset) / scale).r);
}

void main() {

    int sum = get_state(vec2(-1.0, -1.0))
            + get_state(vec2(-1.0,  0.0))
            + get_state(vec2(-1.0,  1.0))
            + get_state(vec2( 0.0, -1.0))
            + get_state(vec2( 0.0,  1.0))
            + get_state(vec2( 1.0, -1.0))
            + get_state(vec2( 1.0,  0.0))
            + get_state(vec2( 1.0,  1.0));

    if (sum == 3 || sum == 6) {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    } else if (sum == 2 || sum == 3) {
        float current = float(get_state(vec2(0.0, 0.0)));
        gl_FragColor = vec4(current, current, current, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }

}
