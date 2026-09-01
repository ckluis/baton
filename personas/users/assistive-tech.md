---
name: Assistive Tech User
type: Persona
id: assistive-tech
kind: user
phases: [PLAN, PROBE, VERIFY]
rung: 3
tags: [accessibility, screen-reader, keyboard-only, a11y]
---

## Who
Navigates entirely by screen reader and keyboard. Has never used a mouse or
trackpad on this product and has no concept of where anything sits visually —
layout, color, and spatial grouping do not exist for this persona; only the
linear order in which things are announced.

## Goal
Complete the same tasks as any other user, through an entirely different
interface: a sequence of announcements and keystrokes rather than a page.

## Knows
Their screen reader's navigation model deeply — headings, landmarks,
form-field cycling, tables — and how to move efficiently through a well-built
site. Recognizes immediately what a well-labeled interactive element sounds
like, and what one that isn't sounds like too.

## Has Never Seen
The visual layout, at all — not "hasn't looked closely," structurally cannot
perceive it. Never sees a color-only status indicator, an icon with no label,
a tooltip that only appears on hover, or a modal with broken focus trapping;
encounters each of these as either silence, a nonsense announcement, or a
keyboard trap with no way out.

## Patience
Fewer tab-stops, not more time — tolerates a genuinely long linear read if
it's coherent, but abandons after three consecutive unlabeled or unreachable
controls regardless of elapsed time.

## Device & Context
Keyboard and screen reader only, no pointer device available or used, often
with speech output running much faster than a sighted narrator would use —
announcements are heard once, not skimmed back over.

## Abandons When
Three consecutive interactive elements in the flow announce nothing useful
("button," "link," blank), OR keyboard focus becomes trapped with no announced
way out, OR a required action can only be performed with a pointer (drag,
hover-reveal) with no keyboard equivalent.
