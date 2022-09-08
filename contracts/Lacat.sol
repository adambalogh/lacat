// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

struct Deposit {
    uint depositNo;

    uint256 amount;
    uint unlockTime;

    bool isWithdrawn;
}

contract Lacat is Ownable {
    using SafeMath for uint256;

    // depositing costs 0.25% of the deposited funds
    uint256 constant FEE_PERCENTAGE_POINT = 25;

    mapping(address => Deposit[]) deposits;
    mapping(address => uint) numDeposits;

    uint256 accumulatedFees;

    event Locked(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);
    event Unlocked(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);

    constructor() {
        accumulatedFees = 0;
    }

    function deposit(uint unlockTime) public payable {
        require(block.timestamp < unlockTime, "Lacat: Unlock time must be in future");

        uint depositNo = numDeposits[_msgSender()];
        uint256 fee = msg.value.mul(100).mul(FEE_PERCENTAGE_POINT).div(100000);
        uint256 depositAmount = msg.value - fee;

        numDeposits[_msgSender()] = depositNo + 1;
        deposits[_msgSender()].push(Deposit(depositNo, depositAmount, unlockTime, false));
        accumulatedFees += fee;

        emit Locked(_msgSender(), depositAmount, depositNo, block.timestamp, unlockTime);
    }

    function getNumDeposits() public view returns (uint) {
        return numDeposits[_msgSender()];
    }

    function getDepositStatus(uint depositNo) public view returns (uint256 amount, uint unlockTime, bool isWithdrawn) {
        require(numDeposits[_msgSender()] >= depositNo, "Lacat: Deposit doesn't exist");
        Deposit memory dep = deposits[_msgSender()][depositNo];

        return (dep.amount, dep.unlockTime, dep.isWithdrawn);
    }

    function withdraw(uint depositNo) public {
        require(numDeposits[_msgSender()] >= depositNo, "Lacat: Deposit doesn't exist");

        Deposit memory depositToWithdraw = deposits[_msgSender()][depositNo];
        require(!depositToWithdraw.isWithdrawn, "Lacat: Deposit already withdrawn");
        require(block.timestamp >= depositToWithdraw.unlockTime, "Lock: Deposit not yet ready to be withdrawn");

        deposits[_msgSender()][depositNo].isWithdrawn = true;
        payable(_msgSender()).transfer(depositToWithdraw.amount);

        emit Unlocked(_msgSender(), depositToWithdraw.amount, depositNo, block.timestamp, depositToWithdraw.unlockTime);
    }

    function withdrawFees(address to) public onlyOwner {
        uint256 fees = accumulatedFees;
        accumulatedFees = 0;

        payable(to).transfer(fees);
    }
}
