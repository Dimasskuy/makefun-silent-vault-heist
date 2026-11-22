# makefun-silent-vault-heist

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Dimasskuy/makefun-silent-vault-heist/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Dimasskuy/makefun-silent-vault-heist/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

SILENT VAULT is a top-down stealth heist game. One thief, one museum, one legendary diamond. Slip past patrolling guards and their vision cones, dodge sweeping security cameras (or kill them at the control panels), watch the alarm meter, thread the laser grid in the vault, lift the Aurora Diamond and optional loot, and reach the getaway van. Three handcrafted floors — The Gallery, Offices & Archives, and The Vault — with a title screen, busted / cleared / final screens, a full HUD, and generative WebAudio sound. No dependencies, no network: plain HTML, Canvas and ES modules.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

## Play it

- **Move** WASD / arrow keys · **Sneak** Shift (slower, harder to spot) · **Interact** E (grab loot, take the diamond, disable a camera at its panel) · **Restart level** R · **Mute** M · **Pause** P / Esc
- **Win a level:** steal the Aurora Diamond, then reach the green getaway van. Optional loot adds score; a ghost run (never seen) pays a bonus.
- **Lose:** a guard catches you, or the alarm hits 100% and its countdown runs out while you are still seen. Hide for 2 seconds to disarm a tripped alarm.
- **Stealth rules:** guards patrol, get suspicious when they glimpse you, investigate the last place they saw you, and chase when they are sure. Cameras sweep and raise the alarm while you stand in their cone. Walls block every cone. Lasers in the vault trip the alarm on touch.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zyx88bys&utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
