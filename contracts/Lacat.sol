// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct Deposit {
    uint depositNo;

    uint256 amount;
    uint unlockTime;

    bool isWithdrawn;
}

contract Lacat is Ownable {
    mapping(address => Deposit[]) deposits;
    mapping(address => uint) numDeposits;

    event Locked(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);
    event Unlocked(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);

    constructor() {
    }

    function deposit(uint unlockTime) public payable {
        require(block.timestamp >= unlockTime, "Lacat: Unlock time must be in future");

        uint depositNo = numDeposits[_msgSender()] + 1;

        numDeposits[_msgSender()] = depositNo;
        deposits[_msgSender()].push(Deposit(depositNo, msg.value, unlockTime, false));

        emit Locked(_msgSender(), msg.value, depositNo, block.timestamp, unlockTime);
    }

    function getDeposits() public view returns (Deposit[] memory) {
        return deposits[_msgSender()];
    }

    function withdraw(uint depositNo) public {
        require(numDeposits[_msgSender()] >= depositNo, "Lacat: Deposit doesn't exist");

        Deposit memory depositToWithdraw = deposits[_msgSender()][depositNo];
        require(!depositToWithdraw.isWithdrawn, "Lacat: Deposit already withdrawn");
        require(block.timestamp >= depositToWithdraw.unlockTime, "Lock: Deposit not yet ready to be withdrawn");

        depositToWithdraw.isWithdrawn = true;
        payable(_msgSender()).transfer(depositToWithdraw.amount);

        emit Unlocked(_msgSender(), depositToWithdraw.amount, depositNo, block.timestamp, depositToWithdraw.unlockTime);
    }
}
