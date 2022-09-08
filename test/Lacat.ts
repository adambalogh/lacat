import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Lacat", function () {

  const ONE_MONTH_IN_SECS = 30 * 24 * 60 * 60;
  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;

  async function deployLacat() {
    const [owner, otherAccount] = await ethers.getSigners();

    const Lacat = await ethers.getContractFactory("Lacat");
    const lacat = await Lacat.deploy();

    return { lacat, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      expect(await lacat.owner()).to.equal(owner.address);
      expect(await lacat.getNumDeposits()).to.eq(0);
    });
  });

  describe("Deposit", function () {
    it("Should revert if unlock time is not in future", async function () {
      const { lacat } = await loadFixture(deployLacat);

      const invalidUnlockTime = (await time.latest()) - 1000;

      await expect(lacat.deposit(invalidUnlockTime, 0, { value: 1000 })).to.be.revertedWith(
        "Lacat: Unlock time must be in future"
      );
    });

    it("Should deposit successfully", async function () {
      const { lacat, otherAccount } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.connect(otherAccount).deposit(unlockTime, 0, { value: 10000 });
      const depositMinusFee = 10000 - 25;

      expect(await lacat.connect(otherAccount).getNumDeposits()).to.eq(1);
      expect(await lacat.connect(otherAccount).getDepositStatus(0)).to.eql([
        ethers.BigNumber.from(depositMinusFee),
        ethers.BigNumber.from(unlockTime),
        false
      ]);
    });

    it("Should support multiple deposits", async function () {
      const { lacat, otherAccount } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.connect(otherAccount).deposit(unlockTime, 0, { value: 10000 });
      await lacat.connect(otherAccount).deposit(unlockTime, 0, { value: 100000 });
      await lacat.connect(otherAccount).deposit(unlockTime, 0, { value: 1000000 });

      expect(await lacat.connect(otherAccount).getNumDeposits()).to.eq(3);

      expect(await lacat.connect(otherAccount).getDepositStatus(0)).to.eql([
        ethers.BigNumber.from(9975),
        ethers.BigNumber.from(unlockTime),
        false
      ]);
      expect(await lacat.connect(otherAccount).getDepositStatus(1)).to.eql([
        ethers.BigNumber.from(99750),
        ethers.BigNumber.from(unlockTime),
        false
      ]);
      expect(await lacat.connect(otherAccount).getDepositStatus(2)).to.eql([
        ethers.BigNumber.from(997500),
        ethers.BigNumber.from(unlockTime),
        false
      ]);
    });

  });


  describe("Fees", function () {
    it("Should transfer fees to the owner's recipient", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 0, { value: 10000 });
      await lacat.deposit(unlockTime, 0, { value: 100000 });
      const fees = 250 + 25;

      expect(await lacat.withdrawFees(owner.address)).to.changeEtherBalances(
        [owner, lacat],
        [fees, -fees]
      );
      expect(await lacat.withdrawFees(owner.address)).to.changeEtherBalances(
        [owner, lacat],
        [0, 0]
      );
    });

    it("Only owner can withdraw", async function () {
      const { lacat, otherAccount } = await loadFixture(deployLacat);
      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      await lacat.deposit(unlockTime, 0, { value: 1000 });

      await expect(lacat.connect(otherAccount).withdrawFees(otherAccount.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Monthly Withdrawal", function () {
    it("Monthly withdrawal not allowed when set to 0", async function () {
      const { lacat } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      await lacat.deposit(unlockTime, 0, { value: 1000 });

      await expect(lacat.withdrawMonthlyAllowance(0)).to.be.revertedWith("Lacat: Montly withdrawal not allowed");
    });

    it("Withdraw once every month", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const now = await time.latest();
      const unlockTime = now + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 100, { value: 1000000 });

      await expect(lacat.withdrawMonthlyAllowance(0)).to.changeEtherBalances(
        [owner, lacat],
        [9975, -9975]
      );
      await expect(lacat.withdrawMonthlyAllowance(0)).to.be.revertedWith(
        "Lacat: Last withdrawal was within a month"
      );

      await time.increase(ONE_MONTH_IN_SECS - 1000);
      await expect(lacat.withdrawMonthlyAllowance(0)).to.be.revertedWith(
        "Lacat: Last withdrawal was within a month"
      );

      await time.increase(1000);
      await expect(lacat.withdrawMonthlyAllowance(0)).to.changeEtherBalances(
        [owner, lacat],
        [9975, -9975]
      );
    });
  });

  describe("Withdrawal", function () {
    it("Should transfer the funds to the owner", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 0, { value: 10000 });
      const lockedAmount = 10000 - 25;

      await time.increaseTo(unlockTime);

      await expect(lacat.withdraw(0)).to.changeEtherBalances(
        [owner, lacat],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should not be able to withdraw twice", async function () {
      const { lacat } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 0, { value: 10000 });

      await time.increaseTo(unlockTime);

      await lacat.withdraw(0);
      expect(await lacat.getDepositStatus(0)).to.eql([
        ethers.BigNumber.from(9975),
        ethers.BigNumber.from(unlockTime),
        true
      ]);

      await expect(lacat.withdraw(0)).to.be.revertedWith(
        "Lacat: Deposit already withdrawn"
      );
    });

    it("Should be able to withdraw all deposits", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 0, { value: 10000 });
      await lacat.deposit(unlockTime, 0, { value: 100000 });
      await lacat.deposit(unlockTime, 0, { value: 1000000 });
      const totalFees = 2775;

      expect(await ethers.provider.getBalance(lacat.address)).to.eq(1110000);

      await time.increaseTo(unlockTime);

      await expect(lacat.withdraw(0)).to.changeEtherBalances(
        [owner, lacat],
        [9975, -9975]
      );
      await expect(lacat.withdraw(1)).to.changeEtherBalances(
        [owner, lacat],
        [99750, -99750]
      );
      await expect(lacat.withdraw(2)).to.changeEtherBalances(
        [owner, lacat],
        [997500, -997500]
      );

      expect(await ethers.provider.getBalance(lacat.address)).to.eq(totalFees);
    });
  });
});
