import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
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

      const invalidUnlockTime = (await time.latest()) - 100;

      await expect(lacat.deposit(invalidUnlockTime, 0, { value: 1000 })).to.be.revertedWith(
        "Lacat: Unlock time must be in future"
      );
    });

    it("Should deposit successfully", async function () {
      const { lacat, otherAccount } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.connect(otherAccount).deposit(unlockTime, 0, { value: 10000 });
      const depositMinusFee = 10000 - 35;

      expect(await lacat.connect(otherAccount).getNumDeposits()).to.eq(1);
      expect(await lacat.connect(otherAccount).getDepositStatus(0)).to.eql([
        ethers.BigNumber.from(depositMinusFee),
        ethers.BigNumber.from(unlockTime)
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
        ethers.BigNumber.from(9965),
        ethers.BigNumber.from(unlockTime)
      ]);
      expect(await lacat.connect(otherAccount).getDepositStatus(1)).to.eql([
        ethers.BigNumber.from(99650),
        ethers.BigNumber.from(unlockTime)
      ]);
      expect(await lacat.connect(otherAccount).getDepositStatus(2)).to.eql([
        ethers.BigNumber.from(996500),
        ethers.BigNumber.from(unlockTime)
      ]);
    });

  });


  describe("Fees", function () {
    it("Should transfer fees to the owner's recipient", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 0, { value: 10000 });
      await lacat.deposit(unlockTime, 0, { value: 100000 });
      const fees = 350 + 35;

      await expect(lacat.withdrawFees(owner.address)).to.changeEtherBalances(
        [owner, lacat],
        [fees, -fees]
      );
      await expect(lacat.withdrawFees(owner.address)).to.changeEtherBalances(
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

    it("Extra fee for monthly withdraw", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);
      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      await lacat.deposit(unlockTime, 100, { value: 1000 });
      const fees = 5;

      await expect(lacat.withdrawFees(owner.address)).to.changeEtherBalances(
        [owner, lacat],
        [fees, -fees]
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
        [10000, -10000]
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
        [10000, -10000]
      );
    });

    it("Doesn't allow withdrawing more than remaining balance", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const now = await time.latest();
      const unlockTime = now + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 8000, { value: 1000000 });

      await expect(lacat.withdrawMonthlyAllowance(0)).to.changeEtherBalances(
        [owner, lacat],
        [800000, -800000]
      );

      await time.increase(ONE_MONTH_IN_SECS);
      await expect(lacat.withdrawMonthlyAllowance(0)).to.changeEtherBalances(
        [owner, lacat],
        [195000, -195000]
      );
    });

    it("Monthly withdraw exhausts all funds", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const now = await time.latest();
      const unlockTime = now + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 10000, { value: 1000000 });

      await expect(lacat.withdrawMonthlyAllowance(0)).to.changeEtherBalances(
        [owner, lacat],
        [995000, -995000]
      );

      await time.increase(ONE_MONTH_IN_SECS);
      await expect(lacat.withdrawMonthlyAllowance(0)).to.be.revertedWith(
        "Lacat: Deposit already withdrawn"
      );

      await time.increase(ONE_YEAR_IN_SECS);

      await expect(lacat.withdraw(0)).to.be.revertedWith(
        "Lacat: Deposit already withdrawn"
      );
      await expect(lacat.withdrawMonthlyAllowance(0)).to.be.revertedWith(
        "Lacat: Deposit already withdrawn"
      );
    });

    it("Invalid withdraw rates", async function () {
      const { lacat } = await loadFixture(deployLacat);

      const now = await time.latest();
      const unlockTime = now + ONE_YEAR_IN_SECS;

      await expect(lacat.deposit(unlockTime, 10001, { value: 1000000 })).to.be.revertedWith(
        "Lacat: Monthly withdraw basis point must be between 0 and 10000"
      )
    });

  });

  describe("Withdrawal", function () {
    it("Should transfer the funds to the owner", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.deposit(unlockTime, 0, { value: 10000 });
      const lockedAmount = 10000 - 35;

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
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(unlockTime)
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
      const totalFees = 3885;

      expect(await ethers.provider.getBalance(lacat.address)).to.eq(1110000);

      await time.increaseTo(unlockTime);

      await expect(lacat.withdraw(0)).to.changeEtherBalances(
        [owner, lacat],
        [9965, -9965]
      );
      await expect(lacat.withdraw(1)).to.changeEtherBalances(
        [owner, lacat],
        [99650, -99650]
      );
      await expect(lacat.withdraw(2)).to.changeEtherBalances(
        [owner, lacat],
        [996500, -996500]
      );

      expect(await ethers.provider.getBalance(lacat.address)).to.eq(totalFees);
    });
  });
});
