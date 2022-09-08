// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

struct Deposit {
    uint256 amount;
    uint unlockTime;

    bool isWithdrawn;
}

contract Lacat is Ownable {
    using SafeMath for uint256;

    // depositing costs 0.25% of the deposited funds
    uint256 constant FEE_PERCENTAGE_POINT = 25;

    mapping(address => Deposit[]) _deposits;
    mapping(address => uint) _numDeposits;

    uint256 _accumulatedFees;

    event Locked(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);
    event Unlocked(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);

    constructor() {
        _accumulatedFees = 0;
    }

    function deposit(uint unlockTime) public payable {
        require(block.timestamp < unlockTime, "Lacat: Unlock time must be in future");

        uint depositNo = _numDeposits[_msgSender()];
        uint256 fee = msg.value.mul(100).mul(FEE_PERCENTAGE_POINT).div(100000);
        uint256 depositAmount = msg.value - fee;

        _numDeposits[_msgSender()] = depositNo + 1;
        _deposits[_msgSender()].push(Deposit(depositAmount, unlockTime, false));
        _accumulatedFees += fee;

        emit Locked(_msgSender(), depositAmount, depositNo, block.timestamp, unlockTime);
    }

    function getNumDeposits() public view returns (uint) {
        return _numDeposits[_msgSender()];
    }

    function getDepositStatus(uint depositNo) public view returns (uint256 amount, uint unlockTime, bool isWithdrawn) {
        require(_numDeposits[_msgSender()] > depositNo, "Lacat: Deposit doesn't exist");
        Deposit memory dep = _deposits[_msgSender()][depositNo];

        return (dep.amount, dep.unlockTime, dep.isWithdrawn);
    }

    function withdraw(uint depositNo) public {
        require(_numDeposits[_msgSender()] > depositNo, "Lacat: Deposit doesn't exist");

        Deposit memory depositToWithdraw = _deposits[_msgSender()][depositNo];
        require(!depositToWithdraw.isWithdrawn, "Lacat: Deposit already withdrawn");
        require(block.timestamp >= depositToWithdraw.unlockTime, "Lock: Deposit not yet ready to be withdrawn");

        _deposits[_msgSender()][depositNo].isWithdrawn = true;
        payable(_msgSender()).transfer(depositToWithdraw.amount);

        emit Unlocked(_msgSender(), depositToWithdraw.amount, depositNo, block.timestamp, depositToWithdraw.unlockTime);
    }

    function withdrawFees(address to) public onlyOwner {
        uint256 fees = _accumulatedFees;
        _accumulatedFees = 0;

        payable(to).transfer(fees);
    }
}
