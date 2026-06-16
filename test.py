import numpy as np
import math

def calculate(expression):
    """ Evaluates a mathematical expression using numpy/math functions. """
    # Allowed names for eval()
    allowed_names = {
        **np.__dict__,
        **math.__dict__
    }
    try:
        result = eval(expression, {"__builtins__": None}, allowed_names)
        return result
    except Exception as e:
        return f"Error evaluating expression '{expression}' : {str(e)}"

if __name__ == "__main__":
    import sys
    expression = ""
    if len(sys.argv) > 1:
        expression = sys.argv[1]
    else:
        try:
            lines = sys.stdin.readlines()
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                print(calculate(line))
        except EOFError:
            pass

