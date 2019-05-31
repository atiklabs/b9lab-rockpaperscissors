# b9lab RockPaperScissors

This is the third project of the Community Blockstars 2019 - Ethereum Developer Course.

## What

* Alice and Bob play RockPaperScissors.
* Each player needs to deposit an amount, possibly 0.
* Each player submits their __"unique"__ move.
* The contract decides and rewards the winner with all the Ether wagered.

## Goals

* Make it an utility.
* Reduce gas cost.
* Let players bet previous winnings.
* Entince the players to play.

## Make sure that...

* If you used enums, did you remember that the first enum's underlying value is actually 0 and that all storage is initially 0 too?
* Did you make sure that Bob cannot spy on Alice's move before he plays?
* Did you let one player use a fixed deadline to play right before then pretend the other one did not show up?
* Did you let secret moves be reused?
* Did you let Alice cancel the game when she saw that Bob's pending move will make her lose?
* No damaging loophole on the RockPaperScissors.
* Game theoretic situations covered in RockPaperScissors.
* Use interfaces

## Thoughts...

* Alice creates a game with a bet, and a coded move with a password (bytes32) and the move (1, 2, 3).
* Bob joins a game with the same bet, his move is public.
* Now Alice can get the reward if winner with her password, or wait until expired then Bob can get the reward.

## Install for development

```
npm install webpack web3 webpack-cli file-loader
```
