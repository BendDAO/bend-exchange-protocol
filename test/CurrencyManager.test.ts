import { assert, expect } from "chai";
import { BigNumber, constants } from "ethers";
import { Contracts, Env, makeSuite } from "./_setup";

makeSuite("CurrencyManager", (contracts: Contracts, env: Env) => {
  it("Revertions work as expected", async () => {
    await expect(contracts.currencyManager.connect(env.admin).addCurrency(contracts.weth.address)).to.be.revertedWith(
      "Currency: already whitelisted"
    );

    await expect(
      contracts.currencyManager.connect(env.admin).removeCurrency(contracts.mockUSDT.address)
    ).to.be.revertedWith("Currency: not whitelisted");
  });

  it("Owner revertions work as expected", async () => {
    await expect(
      contracts.currencyManager.connect(env.admin).removeCurrency("0x0000000000000000000000000000000000000001")
    ).to.be.revertedWith("Currency: not whitelisted");
  });
  it("Owner functions are only callable by owner", async () => {
    const notAdminUser = env.accounts[3];

    await expect(
      contracts.currencyManager.connect(notAdminUser).addCurrency(contracts.mockUSDT.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      contracts.currencyManager.connect(notAdminUser).removeCurrency(contracts.weth.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("View functions work as expected", async () => {
    // Add a 3nd currency
    await contracts.currencyManager.connect(env.admin).addCurrency(contracts.mockUSDT.address);

    const numberCurrencies = await contracts.currencyManager.viewCountWhitelistedCurrencies();
    assert.equal(numberCurrencies.toString(), "3");

    let tx = await contracts.currencyManager.viewWhitelistedCurrencies("0", "1");
    assert.equal(tx[0].length, 1);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(constants.One);

    tx = await contracts.currencyManager.viewWhitelistedCurrencies("1", "100");
    assert.equal(tx[0].length, 2);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(BigNumber.from(numberCurrencies.toString()));
  });
});
