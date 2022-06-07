import { assert, expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { Contracts, Env, makeSuite } from "./_setup";

makeSuite("RoyaltyFeeSetter/RoyaltyFeeRegistry", (contracts: Contracts, env: Env) => {
  it("Owner can set the royalty fee", async () => {
    const fee = "200";
    const MockERC721WithOwner = await ethers.getContractFactory("MockERC721WithOwner");
    const mockERC721WithOwner = await MockERC721WithOwner.deploy("Mock Ownable ERC721", "MOERC721");
    await mockERC721WithOwner.deployed();

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfAdmin(
          mockERC721WithOwner.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          fee
        )
    ).to.be.revertedWith("function selector was not recognized and there's no fallback function");

    const tx = await contracts.royaltyFeeSetter
      .connect(env.admin)
      .updateRoyaltyInfoForCollectionIfOwner(
        mockERC721WithOwner.address,
        env.royaltyCollector.address,
        env.royaltyCollector.address,
        fee
      );

    await expect(tx)
      .to.emit(contracts.royaltyFeeRegistry, "RoyaltyFeeUpdate")
      .withArgs(mockERC721WithOwner.address, env.royaltyCollector.address, env.royaltyCollector.address, fee);
  });
  it("Admin can set the royalty fee", async () => {
    const fee = "200";
    const MockERC721WithAdmin = await ethers.getContractFactory("MockERC721WithAdmin");
    const mockERC721WithAdmin = await MockERC721WithAdmin.deploy("Mock Ownable ERC721", "MOERC721");
    await mockERC721WithAdmin.deployed();

    let res = await contracts.royaltyFeeSetter.checkForCollectionSetter(mockERC721WithAdmin.address);
    assert.equal(res[0], env.admin.address);
    assert.equal(res[1].toString(), "3");

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfOwner(
          mockERC721WithAdmin.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          fee
        )
    ).to.be.revertedWith("function selector was not recognized and there's no fallback function");

    const tx = await contracts.royaltyFeeSetter
      .connect(env.admin)
      .updateRoyaltyInfoForCollectionIfAdmin(
        mockERC721WithAdmin.address,
        env.royaltyCollector.address,
        env.royaltyCollector.address,
        "200"
      );

    await expect(tx)
      .to.emit(contracts.royaltyFeeRegistry, "RoyaltyFeeUpdate")
      .withArgs(mockERC721WithAdmin.address, env.royaltyCollector.address, env.royaltyCollector.address, fee);

    res = await contracts.royaltyFeeSetter.checkForCollectionSetter(mockERC721WithAdmin.address);
    assert.equal(res[0], env.royaltyCollector.address);
    assert.equal(res[1].toString(), "0");
  });

  it("Owner cannot set the royalty fee if already set", async () => {
    const MockERC721WithOwner = await ethers.getContractFactory("MockERC721WithOwner");
    const mockERC721WithOwner = await MockERC721WithOwner.deploy("Mock Ownable ERC721", "MOERC721");
    await mockERC721WithOwner.deployed();

    let res = await contracts.royaltyFeeSetter.checkForCollectionSetter(mockERC721WithOwner.address);
    assert.equal(res[0], env.admin.address);
    assert.equal(res[1].toString(), "2");

    await contracts.royaltyFeeSetter
      .connect(env.admin)
      .updateRoyaltyInfoForCollectionIfOwner(
        mockERC721WithOwner.address,
        env.royaltyCollector.address,
        env.royaltyCollector.address,
        "200"
      );

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfOwner(
          mockERC721WithOwner.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          "200"
        )
    ).to.been.revertedWith("Setter: already set");

    const tx = await contracts.royaltyFeeSetter
      .connect(env.royaltyCollector)
      .updateRoyaltyInfoForCollectionIfSetter(
        mockERC721WithOwner.address,
        env.royaltyCollector.address,
        env.royaltyCollector.address,
        "200"
      );

    await expect(tx)
      .to.emit(contracts.royaltyFeeRegistry, "RoyaltyFeeUpdate")
      .withArgs(mockERC721WithOwner.address, env.royaltyCollector.address, env.royaltyCollector.address, "200");

    res = await contracts.royaltyFeeSetter.checkForCollectionSetter(mockERC721WithOwner.address);
    assert.equal(res[0], env.royaltyCollector.address);
    assert.equal(res[1].toString(), "0");
  });

  it("No function selector if no admin()/owner() function", async () => {
    const res = await contracts.royaltyFeeSetter.checkForCollectionSetter(contracts.mockERC721.address);
    assert.equal(res[0], constants.AddressZero);
    assert.equal(res[1].toString(), "4");

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfOwner(
          contracts.mockERC721.address,
          env.admin.address,
          env.royaltyCollector.address,
          "200"
        )
    ).to.be.revertedWith("function selector was not recognized and there's no fallback function");

    await expect(
      contracts.royaltyFeeSetter.updateRoyaltyInfoForCollectionIfAdmin(
        contracts.mockERC721.address,
        env.admin.address,
        env.royaltyCollector.address,
        "200"
      )
    ).to.be.revertedWith("function selector was not recognized and there's no fallback function");
  });

  it("Cannot adjust if not the setter", async () => {
    await expect(
      contracts.royaltyFeeSetter.updateRoyaltyInfoForCollectionIfSetter(
        contracts.mockERC721.address,
        env.admin.address,
        env.royaltyCollector.address,
        "200"
      )
    ).to.be.revertedWith("Setter: not the setter");
  });

  it("Cannot set a royalty fee too high", async () => {
    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          "9501"
        )
    ).to.be.revertedWith("Registry: royalty fee too high");
  });

  it("Cannot set a royalty fee if not compliant", async () => {
    const MockNonCompliantERC721 = await ethers.getContractFactory("MockNonCompliantERC721");
    const mockNonCompliantERC721 = await MockNonCompliantERC721.deploy("Mock Bad ERC721", "MBERC721");
    await mockNonCompliantERC721.deployed();

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfOwner(
          mockNonCompliantERC721.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          "500"
        )
    ).to.be.revertedWith("Setter: not ERC721/ERC1155");
  });

  it("Cannot set custom royalty fee if ERC2981", async () => {
    const res = await contracts.royaltyFeeSetter.checkForCollectionSetter(contracts.mockERC721WithRoyalty.address);

    assert.equal(res[0], constants.AddressZero);
    assert.equal(res[1].toString(), "1");

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfOwner(
          contracts.mockERC721WithRoyalty.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          "500"
        )
    ).to.be.revertedWith("Owner: must not be ERC2981");

    await expect(
      contracts.royaltyFeeSetter
        .connect(env.admin)
        .updateRoyaltyInfoForCollectionIfAdmin(
          contracts.mockERC721WithRoyalty.address,
          env.royaltyCollector.address,
          env.royaltyCollector.address,
          "500"
        )
    ).to.be.revertedWith("Admin: must not be ERC2981");
  });

  it("Owner functions work as expected", async () => {
    let tx = await contracts.royaltyFeeSetter.connect(env.admin).updateRoyaltyFeeLimit("30");
    await expect(tx).to.emit(contracts.royaltyFeeRegistry, "NewRoyaltyFeeLimit").withArgs("30");

    await expect(contracts.royaltyFeeSetter.connect(env.admin).updateRoyaltyFeeLimit("9501")).to.be.revertedWith(
      "Owner: royalty fee limit too high"
    );

    tx = await contracts.royaltyFeeSetter.connect(env.admin).updateOwnerOfRoyaltyFeeRegistry(env.admin.address);
    await expect(tx)
      .to.emit(contracts.royaltyFeeRegistry, "OwnershipTransferred")
      .withArgs(contracts.royaltyFeeSetter.address, env.admin.address);
  });

  it("Owner functions are only callable by owner", async () => {
    const notAdminUser = env.accounts[3];

    await expect(contracts.royaltyFeeRegistry.connect(notAdminUser).updateRoyaltyFeeLimit("30")).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );

    await expect(
      contracts.royaltyFeeSetter
        .connect(notAdminUser)
        .updateRoyaltyInfoForCollection(
          contracts.mockERC721.address,
          notAdminUser.address,
          notAdminUser.address,
          "5000"
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      contracts.royaltyFeeSetter.connect(notAdminUser).updateOwnerOfRoyaltyFeeRegistry(notAdminUser.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(contracts.royaltyFeeSetter.connect(notAdminUser).updateRoyaltyFeeLimit("10")).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});
