# The README demo: an agent's one-line ask, the request it wrote, one `mm3 class` run, the verdict.
# Render with docs/demo/README.md (fake rehearsal is free; the real render is one paid call).
Output "/out/demo.gif"

Set Shell "bash"
Set Width 1200
Set Height 600
Set FontSize 22
Set Padding 28
Set Framerate 15
Set TypingSpeed 40ms
Set Theme { "name": "MM3", "black": "#0b1424", "red": "#ff7b8a", "green": "#b7ff83", "yellow": "#ffd479", "blue": "#9bdcff", "magenta": "#d7a8ff", "cyan": "#9bdcff", "white": "#f5f8ff", "brightBlack": "#93a7bd", "brightRed": "#ff7b8a", "brightGreen": "#b7ff83", "brightYellow": "#ffd479", "brightBlue": "#9bdcff", "brightMagenta": "#d7a8ff", "brightCyan": "#9bdcff", "brightWhite": "#ffffff", "background": "#0b1424", "foreground": "#f5f8ff", "selection": "#24344f", "cursor": "#b7ff83" }

Hide
Type "cd /work && export PS1='\[\e[38;2;183;255;131m\]$\[\e[0m\] ' && clear"
Enter
Sleep 500ms
Show

Type `# Agent: "Is the ledger-folder lookup in paths.ts safe to merge?"`
Enter
Sleep 1s
Type "cat review.yaml"
Enter
Sleep 4s
Ctrl+L
Type "mm3 class review.yaml"
Enter
Sleep 20s
