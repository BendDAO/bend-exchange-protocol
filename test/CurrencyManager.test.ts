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
    await expect(contracts.currencyManager.connect(env.admin).addCurrency(constants.AddressZero)).to.be.revertedWith(
      "Currency: can not be null address"
    );

    await expect(contracts.currencyManager.connect(env.admin).removeCurrency(constants.AddressZero)).to.be.revertedWith(
      "Currency: not whitelisted"
    );
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
    // Add a 2nd currency
    await contracts.currencyManager.connect(env.admin).addCurrency(contracts.mockUSDT.address);

    const numberCurrencies = await contracts.currencyManager.viewCountWhitelistedCurrencies();
    assert.equal(numberCurrencies.toString(), "2");

    let tx = await contracts.currencyManager.viewWhitelistedCurrencies("0", "1");
    assert.equal(tx[0].length, 1);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(constants.One);

    tx = await contracts.currencyManager.viewWhitelistedCurrencies("1", "100");
    assert.equal(tx[0].length, 1);
    expect(BigNumber.from(tx[1].toString())).to.be.eq(BigNumber.from(numberCurrencies.toString()));
  });
});
