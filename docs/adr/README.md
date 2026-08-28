# Architecture decision records

One file per significant decision — the kind where a different answer would mean different code, not just different code style. Start from [`template.md`](template.md).

| ADR                                              | Decision                             | Status                            |
| ------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| [001](001-isometric-camera.md)                     | Isometric camera, over third-person   | Superseded by [005](005-third-person-apparatus-control.md) |
| [002](002-art-direction.md)                        | Toy diorama as the primary art direction | Accepted                        |
| [003](003-cell-based-fire-simulation.md)           | Cell-based fire simulation as the core system | Accepted                   |
| [004](004-thermal-recovery-as-gameplay-feedback.md) | Thermal recovery as gameplay feedback | Accepted                           |
| [005](005-third-person-apparatus-control.md)       | Third-person firefighter and drivable apparatus | Accepted                 |
| [006](006-arcade-tone-for-younger-players.md)      | Arcade tone and simple controls for ages 5+ | Accepted                     |
| [007](007-ages-5-plus-control-floor.md)            | Ages 5+ control and readability floor | Accepted                           |
| [008](008-quest-outcomes-and-countable-stars.md)  | Completed quests and countable-world-object stars | Accepted                |
| [009](009-no-second-required-verb.md)              | No second firefighting verb or required elevated traversal | Accepted       |
| [011](011-supported-platform-matrix.md)            | Desktop and landscape tablets; phones out of scope | Accepted             |

A settled question from the [decision issue form](../../.github/ISSUE_TEMPLATE/decision.yml) becomes an ADR here once it's answered. Number sequentially, never reuse or renumber; a reversal is a new ADR that supersedes the old one, not an edit to it.
