// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

struct Deposit {
    uint256 amount;
    uint unlockTime;

    uint monthlyWithdrawAmount;
    uint lastMonthlyWithdrawTimestamp;

    bool isWithdrawn;
}

contract Lacat is Ownable {
    using SafeMath for uint256;

    // depositing costs 0.25% of the deposited funds
    uint256 constant FEE_BASIS_POINT = 25;
    uint256 constant BASIS_POINT_MULTIPLIER = 10000;

    uint constant ONE_MONTH_IN_SEC = 30 * 24 * 60 * 60;

    mapping(address => Deposit[]) _deposits;
    mapping(address => uint) _numDeposits;

    uint256 _accumulatedFees;

    event Deposited(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);
    event FinalWithdraw(address depositor, uint amount, uint depositNo, uint when, uint unlockTime);
    event MonthlyWithdraw(address depositor, uint amount, uint amountRemaining);

    constructor() {
        _accumulatedFees = 0;
    }

    function deposit(uint unlockTime, uint monthlyWithdrawBasisPoints) public payable {
        require(block.timestamp < unlockTime, "Lacat: Unlock time must be in future");
        require(monthlyWithdrawBasisPoints <= BASIS_POINT_MULTIPLIER && monthlyWithdrawBasisPoints >= 0,
            "Lacat: Monthly withdraw basis point must be between 0 and 10000");

        uint depositNo = _numDeposits[_msgSender()];
        uint256 fee = msg.value.mul(FEE_BASIS_POINT).div(BASIS_POINT_MULTIPLIER);
        uint256 depositAmount = msg.value - fee;

        uint256 monthlyWithdraw = depositAmount.mul(monthlyWithdrawBasisPoints).div(BASIS_POINT_MULTIPLIER);

        _numDeposits[_msgSender()] = depositNo + 1;
        _deposits[_msgSender()].push(Deposit(depositAmount, unlockTime, monthlyWithdraw, 0, false));
        _accumulatedFees += fee;

        emit Deposited(_msgSender(), depositAmount, depositNo, block.timestamp, unlockTime);
    }

    function getNumDeposits() public view returns (uint) {
        return _numDeposits[_msgSender()];
    }

    function getDepositStatus(uint depositNo) public view depositExists(depositNo) returns (uint256 amount, uint unlockTime, bool isWithdrawn) {
        Deposit memory dep = _deposits[_msgSender()][depositNo];

        return (dep.amount, dep.unlockTime, dep.isWithdrawn);
    }

    function withdraw(uint depositNo) public depositExists(depositNo) {
        Deposit memory depositToWithdraw = _deposits[_msgSender()][depositNo];
        require(!depositToWithdraw.isWithdrawn, "Lacat: Deposit already withdrawn");
        require(block.timestamp >= depositToWithdraw.unlockTime, "Lock: Deposit not yet ready to be withdrawn");

        _deposits[_msgSender()][depositNo].isWithdrawn = true;
        payable(_msgSender()).transfer(depositToWithdraw.amount);

        emit FinalWithdraw(_msgSender(), depositToWithdraw.amount, depositNo, block.timestamp, depositToWithdraw.unlockTime);
    }

    function withdrawMonthlyAllowance(uint depositNo) public depositExists(depositNo) {
        Deposit memory depositToWithdraw = _deposits[_msgSender()][depositNo];

        require(!depositToWithdraw.isWithdrawn, "Lacat: Deposit already withdrawn");
        require(depositToWithdraw.amount > 0, "Lacat: No funds to withdraw");

        require(depositToWithdraw.monthlyWithdrawAmount > 0, "Lacat: Montly withdrawal not allowed");
        require(block.timestamp >= depositToWithdraw.lastMonthlyWithdrawTimestamp + ONE_MONTH_IN_SEC,
            "Lacat: Last withdrawal was within a month");

        uint256 toWithdraw = depositToWithdraw.monthlyWithdrawAmount <= depositToWithdraw.amount 
            ? depositToWithdraw.monthlyWithdrawAmount
            : depositToWithdraw.amount;
        uint256 remainingBalance = depositToWithdraw.amount.sub(toWithdraw);

        _deposits[_msgSender()][depositNo].amount = remainingBalance;
        _deposits[_msgSender()][depositNo].lastMonthlyWithdrawTimestamp = block.timestamp;

        payable(_msgSender()).transfer(toWithdraw);

        emit MonthlyWithdraw(_msgSender(), toWithdraw, remainingBalance);
    }

    function withdrawFees(address to) public onlyOwner {
        uint256 fees = _accumulatedFees;
        _accumulatedFees = 0;

        payable(to).transfer(fees);
    }

    modifier depositExists(uint depositNo) {
        require(_numDeposits[_msgSender()] > depositNo, "Lacat: Deposit doesn't exist");
        _;
    }
}
