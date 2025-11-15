import type { BindingApi } from "@tweakpane/core";
import "./style.css";

import { ListBladeApi, Pane } from "tweakpane";

// ========
//  Models
// ========
class Quad {
    public readonly top_left_x: number;
    public readonly top_left_y: number;
    public readonly bottom_right_x: number;
    public readonly bottom_right_y: number;

    constructor(top_left_x: number, top_left_y: number, bottom_right_x: number, bottom_right_y: number) {
        this.top_left_x = top_left_x;
        this.top_left_y = top_left_y;
        this.bottom_right_x = bottom_right_x;
        this.bottom_right_y = bottom_right_y;
    }

    public get cell_cnt(): number {
        const width = this.bottom_right_x - this.top_left_x + 1;
        const height = this.bottom_right_y - this.top_left_y + 1;
        return (width * height);
    }
};

const INITIAL_GRID_SIZE_LENGTH = 20;
let grid_side_length = INITIAL_GRID_SIZE_LENGTH;
let grid: boolean[]; // false: empty, true: occupied
let quad_list: Quad[]; // mesh

const pane = new Pane();
const elem_grid = document.body.querySelector("#grids") as HTMLElement;

type MeshType = "triangular" | "uniform" | "gaussian" | "perlin";

function get_grid_cell(x: number, y: number) {
    const offset = y * grid_side_length + x;
    return grid[offset];
}

function set_grid_cell(x: number, y: number) {
    const offset = y * grid_side_length + x;
    grid[offset] = true;
}

function clear_grid_cell(x: number, y: number) {
    const offset = y * grid_side_length + x;
    grid[offset] = false;
}

function set_cell(x: number, y: number, color: string = "#a00") {
    set_grid_cell(x, y);

    const offset = y * grid_side_length + x;
    const cell = elem_grid.children[offset] as HTMLDivElement;
    cell.style.backgroundColor = color;
}

function generate_mesh(mesh_type: MeshType) {
    switch (mesh_type) {
        case "triangular":
            for (let y = 0; y < grid_side_length; y++) {
                for (let x = 0; x <= y; x++) {
                    set_cell(x, y);
                }
            }
            break;
        case "uniform":
            for (let y = 0; y < grid_side_length; y++) {
                for (let x = 0; x < grid_side_length; x++) {
                    if (Math.random() > 0.5) {
                        set_cell(x, y);
                    }
                }
            }
            break;
        // case "gaussian":
        //     break;
        // case "perlin":
        //     break;
        default:
            console.warn("todo!");
            break;
    }
}

function greedy_meshing() {
    quad_list = [];

    let total_cell_cnt = 0;
    for (let y = 0; y < grid_side_length; y++) {
        let left = 0;
        while (left < grid_side_length) {
            if (!get_grid_cell(left, y)) {
                ++left;
                continue;
            }
            let right = left + 1;
            while (right < grid_side_length && get_grid_cell(right, y)) {
                ++right;
            }

            let y_extend = y + 1;
            for (; y_extend < grid_side_length; y_extend++) {
                let can_extend = true;
                for (let x_extend = left; x_extend < right; x_extend++) {
                    if (!get_grid_cell(x_extend, y_extend)) {
                        can_extend = false;
                        break;
                    }
                }
                if (!can_extend) {
                    break;
                }
            }

            for (let clear_y = y; clear_y < y_extend; clear_y++) {
                for (let clear_x = left; clear_x < right; clear_x++) {
                    clear_grid_cell(clear_x, clear_y);
                }
            }

            quad_list.push(new Quad(left, y, right - 1, y_extend - 1));
            total_cell_cnt += quad_list.at(-1)!.cell_cnt;

            left = right;
        }
    }

    // print info
    const quad_cnt = quad_list.length;
    console.log(`greedy meshing done! total_cell_cnt = ${total_cell_cnt} ---> quad_cnt = ${quad_cnt}`);

    // determine quad colors
    // 1. build graph, each node is a quad, adjacent nodes means adjacent quads
    const adj_list: number[][] = Array.from({ length: quad_cnt }, () => []);
    const overlap = (l1: number, r1: number, l2: number, r2: number) => {
        return r1 >= l2 && l1 <= r2;
    };
    const adj = (lhs: Quad, rhs: Quad) => {
        if (overlap(lhs.top_left_x, lhs.bottom_right_x, rhs.top_left_x, rhs.bottom_right_x)) {
            return lhs.bottom_right_y + 1 == rhs.top_left_y || rhs.bottom_right_y + 1 == lhs.top_left_y;
        }
        if (overlap(lhs.top_left_y, lhs.bottom_right_y, rhs.top_left_y, rhs.bottom_right_y)) {
            return lhs.bottom_right_x + 1 == rhs.top_left_x || rhs.bottom_right_x + 1 == lhs.top_left_x;
        }
        return false;
    };
    for (let i = 0; i < quad_cnt; i++) {
        for (let j = 0; j < quad_cnt; j++) {
            if (i != j && adj(quad_list[i], quad_list[j])) {
                adj_list[i].push(j);
            }
        }
    }

    // 2. allocate color ids
    let color_cnt = 0;
    const quad_color_id: number[] = new Array(quad_cnt).fill(-1);
    for (let i = 0; i < quad_cnt; i++) {
        let use_existing_color = false;

        for (let id = 0; id < color_cnt; id++) {
            let curr_color_valid = true;
            for (const adj_quad of adj_list[i]) {
                if (quad_color_id[adj_quad] == id) {
                    curr_color_valid = false;
                    break;
                }
            }
            if (curr_color_valid) {
                use_existing_color = true;
                quad_color_id[i] = id;
                break;
            }
        }

        if (!use_existing_color) {
            quad_color_id[i] = color_cnt++;
        }
    }

    // 3. allocate colors
    const quad_color_list: string[] = Array.from({ length: color_cnt }, () => {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return `rgb(${r}, ${g}, ${b})`;
    });

    console.log(`color allocation done! quad_cnt = ${quad_cnt} ---> color_cnt = ${color_cnt}`);

    // render quads
    quad_list.forEach((quad, i) => {
        for (let y = quad.top_left_y; y <= quad.bottom_right_y; y++) {
            for (let x = quad.top_left_x; x <= quad.bottom_right_x; x++) {
                set_cell(x, y, quad_color_list[quad_color_id[i]]);
            }
        }
    });
}

function init_grids() {
    grid = new Array(grid_side_length * grid_side_length).fill(false);

    elem_grid.replaceChildren();
    for (let y = 0; y < grid_side_length; y++) {
        for (let x = 0; x < grid_side_length; x++) {
            const cell = document.createElement("div");
            cell.className = `grid-cell `;

            elem_grid.appendChild(cell);
        }
    }

    elem_grid.style.gridTemplateColumns = `repeat(${grid_side_length}, 1fr)`;
    elem_grid.style.gridTemplateRows = `repeat(${grid_side_length}, 1fr)`;
}

function init_gui() {
    const control = pane.addFolder({
        title: 'Control',
        expanded: true,
    });

    const grid_size_control_params = {
        side_length: INITIAL_GRID_SIZE_LENGTH
    };


    const mesh_type_control = control.addBlade({
        view: "list",
        label: "mesh_type",
        options: [
            { text: "triangular", value: "triangular" as MeshType },
            { text: "uniform", value: "uniform" as MeshType },
            // { text: "gaussian", value: "gaussian" as MeshType },
            // { text: "perlin", value: "perlin" as MeshType },
        ],
        value: "triangular",
    });
    (mesh_type_control as BindingApi<unknown>).on("change", ev => {
        init_grids();
        generate_mesh(ev.value as MeshType);
    });

    const grid_size_control = control.addBinding(grid_size_control_params, "side_length", { min: 5, max: 100, step: 1 });
    grid_size_control.on("change", ev => {
        grid_side_length = ev.value;
        init_grids();
        generate_mesh((mesh_type_control as ListBladeApi<unknown>).value as MeshType);
    });

    const btn = control.addButton({
        title: 'Do Greedy Meshing 😸',
    });
    btn.on("click", _ => {
        greedy_meshing();
    });
}

init_gui();
init_grids();
generate_mesh("triangular");
