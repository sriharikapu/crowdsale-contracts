/* eslint-env node, mocha */

import expectThrow from "./helpers/expectThrow";
import { EXCHANGE_RATES, SUPPLIES, STATES } from "./helpers/constants";

const Crowdsale = artifacts.require("./ico/EventChainCrowdsale.sol");
const EventChain = artifacts.require("./ico/EventChain.sol");

contract("Crowdsale{Phase2}", accounts => {
    const beneficiaryAccount = accounts[2],
        investorAccount = accounts[1],
        beneficiaryTwoAccount = accounts[3];
    const PHASE1_RAISED = web3.toWei(2, "ether"),
        BENEFICIARY_TWO_CLAIM = PHASE1_RAISED * 0.03,
        BENEFICIARY_CLAIM = PHASE1_RAISED - BENEFICIARY_TWO_CLAIM;
    let crowdsale, evc;

    before(async() => {
        evc = await EventChain.new();
        crowdsale = await Crowdsale.new(evc.address, beneficiaryAccount, beneficiaryTwoAccount);
        await evc.setMintAgent(crowdsale.address, true);
        await crowdsale.startPhase1();
        await crowdsale.sendTransaction({ from: investorAccount, value: PHASE1_RAISED });
    });

    describe("startPhase2()", () => {
        let txResult, remainingPhase1Supply, beneficiaryBalanceBefore, beneficiaryTwoBalanceBefore;

        before(async() => {
            beneficiaryBalanceBefore = await web3.eth.getBalance(beneficiaryAccount);
            beneficiaryTwoBalanceBefore = await web3.eth.getBalance(beneficiaryTwoAccount);
            remainingPhase1Supply = await crowdsale.currentSupply.call();
            txResult = await crowdsale.startPhase2();
        });

        it("should set the currentRate to 920 EVC/ETH", async() => {
            const currentRate = await crowdsale.currentRate.call();

            assert.equal(currentRate.toNumber(), EXCHANGE_RATES.PHASE2);
        });

        it("should set the currentTotalSupply to be the remainder of phase1 plus the initial phase2 supply", async() => {
            const currentTotalSupply = await crowdsale.currentTotalSupply.call();

            assert.equal(currentTotalSupply.toNumber(), remainingPhase1Supply.add(SUPPLIES.PHASE2));
        });

        it("should set the currentSupply to the same value as the  currentTotalSupply", async() => {
            const currentSupply = await crowdsale.currentSupply.call();
            const currentTotalSupply = await crowdsale.currentTotalSupply.call();

            assert.equal(currentSupply.toNumber(), currentTotalSupply);
        });

        it("should set the currentState to 'Phase2'", async() => {
            const currentState = await crowdsale.currentState.call();

            assert.equal(currentState, STATES.PHASE2);
        });

        it("should claim the phase1 funds for the beneficiaries", async() => {
            const fundsAfterClosed = await web3.eth.getBalance(crowdsale.address);

            assert.equal(fundsAfterClosed.toNumber(), 0);
        });

        it("should claim 3% of the phase1 funds for the beneficiary two", async() => {
            const beneficiaryTwoBalance = await web3.eth.getBalance(beneficiaryTwoAccount);

            assert.equal(beneficiaryTwoBalance.toNumber(), beneficiaryTwoBalanceBefore.add(BENEFICIARY_TWO_CLAIM));
        });

        it("should claim 97% of the phase1 funds for the beneficiary", async() => {
            const beneficiaryBalance = await web3.eth.getBalance(beneficiaryAccount);

            assert.equal(beneficiaryBalance.toNumber(), beneficiaryBalanceBefore.add(BENEFICIARY_CLAIM));
        });

        it("should raise an FundsClaimed event for the beneficiaryTwo", async() => {
            const { event, args } = txResult.logs[0],
                { receiver, claim, crowdsalePhase } = args;

            assert.equal(event, "FundsClaimed");
            assert.equal(receiver, beneficiaryTwoAccount);
            assert.equal(claim.toNumber(), BENEFICIARY_TWO_CLAIM);
            assert.equal(crowdsalePhase, "Phase 1");
        });

        it("should raise an FundsClaimed event for the beneficiary", async() => {
            const { event, args } = txResult.logs[1],
                { receiver, claim, crowdsalePhase } = args;

            assert.equal(event, "FundsClaimed");
            assert.equal(receiver, beneficiaryAccount);
            assert.equal(claim.toNumber(), BENEFICIARY_CLAIM);
            assert.equal(crowdsalePhase, "Phase 1");
        });

        it("should raise an StateChanged event from 'Phase1' to 'Phase2'", async() => {
            const { event, args } = txResult.logs[2],
                { from, to } = args;

            assert.equal(event, "StateChanged");
            assert.equal(from, STATES.PHASE1);
            assert.equal(to, STATES.PHASE2);
        });
    });

    describe("State.Phase2", () => {
        it("should throw an error when startPhase1 is called", async() => {
            await expectThrow(crowdsale.startPhase1());
        });

        it("should throw an error when startPhase2 is called more then once", async() => {
            await expectThrow(crowdsale.startPhase2());
        });

        it("should throw an error when endCrowdsale is called", async() => {
            await expectThrow(crowdsale.endCrowdsale());
        });

        it("should raise an error when startPhase3 is called by someone other than the owner", async() => {
            await expectThrow(crowdsale.startPhase3({ from: investorAccount }));
        });
    });

    describe("send(3 ether)", () => {
        const WEI_SENT = web3.toWei(3, "ether");
        const TOKENS_BOUGHT = web3.toBigNumber(EXCHANGE_RATES.PHASE2).mul(WEI_SENT);
        let balanceBefore, supplyBefore, mintableSupplyBefore, currentTotalSupplyBefore, fundsBefore, totalRaisedBefore, txResult;

        before(async() => {
            balanceBefore = await evc.balanceOf.call(investorAccount);
            supplyBefore = await crowdsale.currentSupply.call();
            currentTotalSupplyBefore = await crowdsale.currentTotalSupply.call();
            totalRaisedBefore = await crowdsale.totalRaised.call();
            mintableSupplyBefore = await evc.mintableSupply.call();
            fundsBefore = web3.eth.getBalance(crowdsale.address);
            txResult = await crowdsale.sendTransaction({ from: investorAccount, value: WEI_SENT });
        });

        it("should add 3 ether to the crowdsale's funds", async() => {
            assert.equal(
                web3.eth.getBalance(crowdsale.address).toNumber(),
                fundsBefore.add(WEI_SENT).toNumber()
            );
        });

        it("should add 3 ether to the crowdsale's totalRaised member", async() => {
            const totalRaised = await crowdsale.totalRaised.call();

            assert.equal(totalRaised, totalRaisedBefore.add(WEI_SENT).toNumber());
        });

        it("should transfer 2760 tokens to the investor's address", async() => {
            const balance = await evc.balanceOf.call(investorAccount);

            assert.equal(web3.toBigNumber(balance).minus(balanceBefore).toNumber(), TOKENS_BOUGHT);
        });

        it("should reduce the currentSupply by 2760 tokens", async() => {
            const currentSupply = await crowdsale.currentSupply.call();

            assert.equal(currentSupply.toNumber(), supplyBefore.minus(TOKENS_BOUGHT));
        });

        it("should NOT change the presale's currentTotalSupply", async() => {
            const currentTotalSupply = await crowdsale.currentTotalSupply.call();

            assert.equal(currentTotalSupply.toNumber(), currentTotalSupplyBefore);
        });

        it("should reduce the token's mintableSupply by 2760", async() => {
            const mintableSupply = await evc.mintableSupply.call();

            assert.equal(mintableSupply.toNumber(), mintableSupplyBefore.minus(TOKENS_BOUGHT));
        });

        it("should raise an InvestmentMade event", async() => {
            const { event, args } = txResult.logs[0],
                { investor, weiAmount, tokenAmount, crowdsalePhase, calldata } = args;

            assert.equal(event, "InvestmentMade");
            assert.equal(investor, investorAccount);
            assert.equal(weiAmount, WEI_SENT);
            assert.equal(tokenAmount.toNumber(), TOKENS_BOUGHT);
            assert.equal(crowdsalePhase, "Phase 2");
            assert.equal(calldata, "0x");
        });
    });
});
