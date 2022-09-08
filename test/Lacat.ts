import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Lacat", function () {

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

      await expect(lacat.deposit(invalidUnlockTime, { value: 1000 })).to.be.revertedWith(
        "Lacat: Unlock time must be in future"
      );
    });

    it("Should deposit successfully", async function () {
      const { lacat, otherAccount } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

      await lacat.connect(otherAccount).deposit(unlockTime, { value: 1000 });

      expect(await lacat.connect(otherAccount).getNumDeposits()).to.eq(1);
      expect(await lacat.connect(otherAccount).getDepositStatus(0)).to.eql([
        ethers.BigNumber.from("1000"),
        ethers.BigNumber.from(unlockTime),
        false
      ]);
    });

  });

  describe("Withdrawal", function () {
    it("Should transfer the funds to the owner", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      const lockedAmount = 1000;

      await lacat.deposit(unlockTime, { value: lockedAmount });

      await time.increaseTo(unlockTime);

      await expect(lacat.withdraw(0)).to.changeEtherBalances(
        [owner, lacat],
        [lockedAmount, -lockedAmount]
      );
    });

    it("Should not be able to withdraw twice", async function () {
      const { lacat, owner } = await loadFixture(deployLacat);

      const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
      const lockedAmount = 1000;

      await lacat.deposit(unlockTime, { value: lockedAmount });

      await time.increaseTo(unlockTime);

      await lacat.withdraw(0);
      expect(await lacat.getDepositStatus(0)).to.eql([
        ethers.BigNumber.from("1000"),
        ethers.BigNumber.from(unlockTime),
        true
      ]);

      await expect(lacat.withdraw(0)).to.be.revertedWith(
        "Lacat: Deposit already withdrawn"
      );
    });
  });
});
