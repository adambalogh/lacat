# Lacat - Smart Wallets

Lacat allows you to securely store your funds in a timed safebox (`Lacat.sol`).

After depositing, you can only withdraw your funds after a given point in time that you specify when you make a deposit.
This lets you stop worrying about losing your funds due to a hack or theft, panic-selling or accidentally sending it to someone.

In case you need emergency access, you can optionally specify what portion of your funds can be withdrawn each month.
For example, you could set the unlock date to be 2 years from now, but allow withdrawing 0.5% of your funds every month
in case you need it. 

Frontend WIP [here](https://github.com/adambalogh/lacat-frontend)

## Planned features

- change monthly withdrawal limits after deposit
- support ERC-20 tokens
- Add staking/yield farming for deposited funds
