enum Operations {
  Move, // number
  Mod, // number
  LoopOpen, // number
  LoopClose, // number
  SetCell, // number
  SearchZeroCell, // number, stores the step with
  Print,
  Read,
  End,
}

type Ops = [Operations.Print | Operations.Read | Operations.End] | [
  | Operations.Move
  | Operations.Mod
  | Operations.LoopOpen
  | Operations.LoopClose
  | Operations.SetCell
  | Operations.SearchZeroCell,
  number,
];

function compile(source: string): Ops[] {
  const ret: Ops[] = [];

  for (const s of source) {
    switch (s) {
      case "<":
        ret.push([Operations.Move, -1]);
        break;
      case ">":
        ret.push([Operations.Move, 1]);
        break;
      case "-":
        ret.push([Operations.Mod, -1]);
        break;
      case "+":
        ret.push([Operations.Mod, 1]);
        break;
      case ".":
        ret.push([Operations.Print]);
        break;
      case ",":
        ret.push([Operations.Read]);
        break;
      case "[":
        ret.push([Operations.LoopOpen, 0]);
        break;
      case "]":
        ret.push([Operations.LoopClose, 0]);
        break;
      default: // nothing todo
    }
  }
  return ret;
}

function optimize(input: Readonly<Ops[]>): Ops[] {
  const out: Ops[] = [];
  {
    let prepre: Ops | undefined = undefined;
    let pre: Ops | undefined = undefined;
    for (const cur of input) {
      if (pre?.[0] === Operations.Move && cur[0] === Operations.Move) {
        pre = [Operations.Move, pre[1] + cur[1]];
      } else if (pre?.[0] === Operations.Mod && cur[0] === Operations.Mod) {
        pre = [Operations.Mod, pre[1] + cur[1]];
      } else if (
        prepre?.[0] === Operations.LoopOpen && pre?.[0] === Operations.Mod &&
        pre?.[1] === -1 && cur[0] === Operations.LoopClose
      ) {
        prepre = undefined;
        pre = [Operations.SetCell, 0];
      } else if (
        prepre?.[0] === Operations.LoopOpen && pre?.[0] === Operations.Move &&
        cur[0] === Operations.LoopClose
      ) {
        prepre = undefined;
        pre = [Operations.SearchZeroCell, pre[1]];
      } else if (
        pre?.[0] === Operations.SetCell && pre?.[1] === 0 &&
        cur[0] === Operations.Mod
      ) {
        pre = [Operations.SetCell, cur[1]];
      } else {
        if (prepre !== undefined) {
          out.push(prepre);
        }
        prepre = pre;
        pre = cur;
      }
    }
    if (prepre !== undefined) {
      out.push(prepre);
    }
    if (pre !== undefined) {
      out.push(pre);
    }
  }

  return out;
}

function calculateLoopDestinations(compiled: Ops[]): void {
  const stack: number[] = [];

  for (let i = 0; i < compiled.length; i++) {
    switch (compiled[i][0]) {
      case Operations.LoopOpen:
        stack.push(i);
        break;
      case Operations.LoopClose: {
        const startPos = stack.pop();
        if (startPos === undefined) {
          throw new Error("missing [ for ]");
        }

        compiled[startPos] = [Operations.LoopOpen, i];
        compiled[i] = [Operations.LoopClose, startPos];
        break;
      }
      default: // not relevant for this optimization
        break;
    }
  }

  if (stack.length !== 0) {
    throw new Error("missing ] for [");
  }

  compiled.push([Operations.End]);
}

function interpret(input: Ops[]): void {
  const memory = new Int8Array(30000);
  let pos = 0;
  let ip = 0;
  const outBuffer = new Uint8Array(1);

  main:
  while (true) {
    const op = input[ip][0];
    switch (op) {
      case Operations.Move:
        pos += input[ip][1]!;
        break;
      case Operations.Mod:
        memory[pos] += input[ip][1]!;
        break;
      case Operations.LoopOpen:
        if (memory[pos] === 0) {
          ip = input[ip][1]!;
        }
        break;
      case Operations.LoopClose:
        if (memory[pos] !== 0) {
          ip = input[ip][1]!;
        }
        break;
      case Operations.SetCell:
        memory[pos] = input[ip][1]!;
        break;
      case Operations.SearchZeroCell:
        while (memory[pos] != 0) {
          pos += input[ip][1]!;
        }
        break;
      case Operations.Print: {
        const o = memory[pos];
        outBuffer[0] = o;
        Deno.stdout.writeSync(outBuffer);
        break;
      }
      case Operations.Read: //  memory[pos] =
        throw new Error("read is not yet implemented");
      case Operations.End:
        break main;
    }
    ip += 1;
  }
}

function generateCWithWhile(input: Ops[]): string {
  let out = "#include <stdio.h>\n";
  out += "#include <stdlib.h>\n";
  out += "#include <string.h>\n";

  out += "int main(void) {\n";
  out += "  char memory[30000]; memset(memory, 0, sizeof(memory));\n";
  out += "  size_t pos = 0;";

  for (let i = 0; i < input.length; i++) {
    const o = input[i];
    switch (o[0]) {
      case Operations.Move:
        out += `  pos += ${o[1]};\n`;
        break;
      case Operations.Mod:
        out += `  memory[pos] += ${o[1]};\n`;
        break;
      case Operations.LoopOpen:
        out += `  while(memory[pos] != 0) {\n`;
        break;
      case Operations.LoopClose:
        out += `  }\n`;
        break;
      case Operations.SetCell:
        out += `  memory[pos] = ${o[1]!};`;
        break;
      case Operations.SearchZeroCell:
        out += `  while (memory[pos] != 0) { pos += ${o[1]}; }\n`;
        break;
      case Operations.Print:
        out += "  putchar(memory[pos]);\n";
        break;
      case Operations.Read: //  memory[pos] =
        throw new Error("read is not yet implemented");
      case Operations.End:
        break;
    }
  }

  out += "}";

  return out;
}

const source = Deno.readTextFileSync(Deno.args[0]);
let ops = compile(source);
ops = optimize(ops);
calculateLoopDestinations(ops);
// compile with gcc -march=native -mtune=native -O3 generated.c
//Deno.writeTextFileSync("generated.c", generateCWithGoto(ops));
Deno.writeTextFileSync("generated.c", generateCWithWhile(ops));
//interpret(ops);
