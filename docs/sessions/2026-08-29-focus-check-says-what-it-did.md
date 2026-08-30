# Making the focus check state its own result

**Date:** 2026-08-29

Fourth report: still no blurred photograph offered, and — importantly — no "could not be
checked" message either. The message added in the previous round was meant to distinguish
failure from success, and it did not, because it only covered one of the two ways to fail.

## The hole in the previous fix

Failures were reported per photograph. A failure *outside* the per-photograph loop — building
the image processor, or anything else before the results are stored — left the readings map
empty. An empty map means no failures to report and nothing to offer, which on screen is
identical to an album where every photograph was measured and judged fine.

So three states still looked the same:

- the check never ran,
- the check ran and could read nothing,
- the check ran, read everything, and found nothing worth mentioning.

## What the album says now

One line, whenever the check has produced any result at all:

> **Focus check:** read 3 of 3. Softest reading 0.96 (anything under 0.4 is offered above).
> This line is here while the setting is being tuned and will come out afterwards.

It names how many photographs were read, how many could not be, how many carried too little
contrast to judge, and **the softest reading found**. That last number is the one that would
settle whether the threshold is wrong, and it cannot be obtained from any synthetic scene —
only from a real album.

The whole measurement pass is now inside its own error handling, so a failure anywhere in it
marks the photographs as unread rather than leaving the album silent.

## Why a temporary line rather than a permanent one

It says in the interface that it is temporary, because it is: a family album has no business
displaying a decimal. It stays until the threshold is set from a real reading and comes out
in the same change that sets it.

The alternative considered and rejected was storing the reading in the database, so the
numbers could be read directly from here. It would have meant a migration, a column grant, an
advisor run and a client write path — a production schema change to obtain one number that a
line of text can carry. Worth revisiting later as a way to stop re-measuring on every album
open; not worth it as a diagnostic.

## Still unconfirmed

Everything about the owner's actual photographs. This round does not claim to fix the
complaint — it claims to make the next look say which of three things is true, which the
previous two rounds could not.
