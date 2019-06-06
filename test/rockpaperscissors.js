const RockPaperScissors = artifacts.require("RockPaperScissors.sol");
const expectedExceptionPromise = require("../util/expected-exception-promise.js");
const getTransactionCost = require("../util/get-transaction-cost.js");
const { toWei, toBN, fromAscii } = web3.utils;

contract('RockPaperScissors', accounts => {
    const [ owner, alice, bob, carol ] = accounts;
    const quantity = toWei('0.01', 'ether');  // contract won't take fees
    const quantity2 = toWei('0.02', 'ether');  // contract won't take fees
    const quantityBN = toBN(quantity);
    const quantity2BN = toBN(quantity2);
    const password = fromAscii("bananas");
    const password2 = fromAscii("cherries");
    const secondsInDay = 86400;
    const move = {
        unset: 0,
        rock: 1,
        paper: 2,
        scissors: 3
    };
    let instance;
    let maxExpirationSeconds;
    let hash;

    before("check if the setup is correct to pass the tests", async function() {

        let aliceBalanceBN = toBN(await web3.eth.getBalance(alice));
        let minimum = toBN(toWei('10', 'ether'));
        assert.isTrue(aliceBalanceBN.gte(minimum));
    });

    beforeEach("deploy and prepare", async function() {

        instance = await RockPaperScissors.new(false, {from: owner});
        maxExpirationSeconds = await instance.maxExpirationSeconds.call();
        hash = await instance.generateHash(bob, move.rock, password, {from: alice});
    });

    describe("generate hashes", function() {

        it("should fail if wrong move", async function() {

            await expectedExceptionPromise(function() {
                return instance.generateHash(bob, move.unset, password, {from: alice});
            });
            await expectedExceptionPromise(function() {
                return instance.generateHash(bob, 4, password, {from: alice});
            });
        });

        it("should fail if password is empty", async function() {

            await expectedExceptionPromise(function() {
                return instance.generateHash(bob, move.rock, fromAscii(""), {from: alice});
            });
        });

        it("should do different hashes in different contracts", async function() {

            let instance2 = await RockPaperScissors.new(false, {from: owner});
            let hash2 = await instance2.generateHash(bob, move.rock, password, {from: alice});
            assert.notEqual(hash, hash2, "Same hash in different contracts.");
        })
    });

    describe("new game creation", function() {

        it("should create a new game", async function() {

            let txObj = await instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});

            // Check event
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log event hash is not correct");
            assert.strictEqual(args['creator'], alice, "Log creator is not correct");
            assert.strictEqual(args['opponent'], bob, "Log opponent is not correct");
            assert.strictEqual(args['bet'].toString(), quantity, "Log bet is not correct");
            // Calculate expiration date
            let block = await web3.eth.getBlock('latest');
            let calculatedExpirationTime = block.timestamp + secondsInDay;
            assert.strictEqual(args['expiration'].toString(), calculatedExpirationTime.toString(), "Log expiration time is not correct");

            // Check that the contract has the sent balance so it did not bounced
            let contractBalance = toBN(await web3.eth.getBalance(instance.address));
            assert.strictEqual(contractBalance.toString(), quantityBN.toString(), "Contract does not have the ether we sent");

            // Check storage updated as expected
            let game = await instance.games.call(hash);
            assert.strictEqual(game['creator'], alice, "Game creator is not correct on creation");
            assert.strictEqual(game['opponent'], bob, "Game opponent is not correct on creation");
            assert.strictEqual(game['bet'].toString(), quantityBN.toString(), "Game bet is not correct on creation");
            assert.strictEqual(game['expiration'].toString(), calculatedExpirationTime.toString(), "Game expiration time is not correct on creation");
            assert.strictEqual(game['opponentMove'].toString(), move.unset.toString(), "Game move is not correct on creation");
        });

        it("should not let create a game with wrong expiration", async function () {

            await expectedExceptionPromise(async function() {
                return await instance.newGame(hash, bob, 0, {from: alice, value: quantity});
            });
            await expectedExceptionPromise(async function() {
                return await instance.newGame(hash, bob, maxExpirationSeconds + 1, {from: alice, value: quantity});
            });
        });

        it("should not let use the same password twice", async function () {

            await instance.newGame(hash, carol, secondsInDay, {from: alice, value: quantity});
            await expectedExceptionPromise(async function() {
                return await instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
            });
        });
    });

    describe("set opponent move", function() {

        beforeEach("add a new game", async function() {

            await instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
        });

        it("should set the opponent move", async function () {

            let contractBalance = toBN(await web3.eth.getBalance(instance.address));
            let txObj = await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});

            // Check event
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log event hash is not correct");
            assert.strictEqual(args['move'].toString(), move.scissors.toString(), "Log move is not correct");
            // Calculate expiration date
            let block = await web3.eth.getBlock('latest');
            let calculatedExpirationTime = block.timestamp + secondsInDay;
            assert.strictEqual(args['newExpiration'].toString(), calculatedExpirationTime.toString(), "Log newExpiration time is not correct");

            // Check that the contract has the sent balance so it did not bounced
            let newContractBalance = toBN(await web3.eth.getBalance(instance.address));
            assert.strictEqual(contractBalance.add(quantityBN).toString(), newContractBalance.toString(), "Contract does not have the ether we sent");

            // Check storage updated as expected
            let game = await instance.games.call(hash);
            assert.strictEqual(game['creator'], alice, "Game creator is not correct after setting opponent");
            assert.strictEqual(game['opponent'], bob, "Game opponent is not correct after setting opponent");
            assert.strictEqual(game['bet'].toString(), quantityBN.toString(), "Game bet is not correct after setting opponent");
            assert.strictEqual(game['expiration'].toString(), calculatedExpirationTime.toString(), "Game expiration time is not correct after setting opponent");
            assert.strictEqual(game['opponentMove'].toString(), move.scissors.toString(), "Game move is not correct after setting opponent");
        });

        it("should not let set a non existing hash", async function () {

            await expectedExceptionPromise(async function() {
                let hash2 = await instance.generateHash(bob, move.rock, password2, {from: alice});
                return await instance.setOpponentMove(hash2, move.scissors, {from: bob, value: quantity});
            });
        });

        it("should not let set a wrong move", async function () {

            await expectedExceptionPromise(async function() {
                return await instance.setOpponentMove(hash, move.unset, {from: bob, value: quantity});
            });
            await expectedExceptionPromise(async function() {
                return await instance.setOpponentMove(hash, 4, {from: bob, value: quantity});
            });
        });

        it("should not let join the wrong opponent", async function () {

            await expectedExceptionPromise(async function() {
                return await instance.setOpponentMove(hash, move.scissors, {from: carol, value: quantity});
            });
        });

        it("should not let join with wrong bet", async function () {

            await expectedExceptionPromise(async function() {
                return await instance.setOpponentMove(hash, move.scissors, {from: bob});
            });
            await expectedExceptionPromise(async function() {
                return await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity + 1});
            });
        });

        it("should not let opponent play after expiration", async function () {

            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*24*3600], id: 0}, err => console.log);
            await expectedExceptionPromise(async function() {
                return instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            });
        });

        it("should not let opponent set the move twice", async function () {

            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await expectedExceptionPromise(async function() {
                return instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            });
        });
    });

    describe("revealing the result", function () {

        beforeEach("add a new game", async function() {

            await instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
        });

        it("should set the right result when creator wins", async function () {

            // Alice plays rock and bob plays scissors
            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            let txObj = await instance.revealResult(bob, move.rock, password, {from: alice});

            // Check event
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log event hash is not correct");
            assert.strictEqual(args['creator'], alice, "Log creator is not correct");
            assert.strictEqual(args['opponent'], bob, "Log opponent is not correct");
            assert.strictEqual(args['creatorAmount'].toString(), quantity2BN.toString(), "Log creator amount is not correct");
            assert.strictEqual(args['opponentAmount'].toString(), "0", "Log opponent amount is not correct");

            // Check that bet has been set to 0
            let game = await instance.games.call(hash);
            assert.strictEqual(game['bet'].toString(), "0", "Game bet is not correct after revealing result");

            // Check that the balances are set correctly
            let balanceAlice = await instance.balances.call(alice);
            let balanceBob = await instance.balances.call(bob);
            assert.strictEqual(balanceAlice.toString(), quantity2BN.toString(), "Balance for Alice is not correct");
            assert.strictEqual(balanceBob.toString(), "0", "Balance for Bob is not correct");
        });

        it("should set the right result when opponent wins", async function () {

            // Alice plays rock and bob plays paper
            await instance.setOpponentMove(hash, move.paper, {from: bob, value: quantity});
            let txObj = await instance.revealResult(bob, move.rock, password, {from: alice});

            // Check event
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log event hash is not correct");
            assert.strictEqual(args['creator'], alice, "Log creator is not correct");
            assert.strictEqual(args['opponent'], bob, "Log opponent is not correct");
            assert.strictEqual(args['creatorAmount'].toString(), "0", "Log creator amount is not correct");
            assert.strictEqual(args['opponentAmount'].toString(), quantity2BN.toString(), "Log opponent amount is not correct");

            // Check that bet has been set to 0
            let game = await instance.games.call(hash);
            assert.strictEqual(game['bet'].toString(), "0", "Game bet is not correct after revealing result");

            // Check that the balances are set correctly
            let balanceAlice = await instance.balances.call(alice);
            let balanceBob = await instance.balances.call(bob);
            assert.strictEqual(balanceAlice.toString(), "0", "Balance for Alice is not correct");
            assert.strictEqual(balanceBob.toString(), quantity2BN.toString(), "Balance for Bob is not correct");
        });

        it("should set the right result when it's a draw", async function () {

            // Alice plays rock and bob plays paper
            await instance.setOpponentMove(hash, move.rock, {from: bob, value: quantity});
            let txObj = await instance.revealResult(bob, move.rock, password, {from: alice});

            // Check event
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log event hash is not correct");
            assert.strictEqual(args['creator'], alice, "Log creator is not correct");
            assert.strictEqual(args['opponent'], bob, "Log opponent is not correct");
            assert.strictEqual(args['creatorAmount'].toString(), quantityBN.toString(), "Log creator amount is not correct");
            assert.strictEqual(args['opponentAmount'].toString(), quantityBN.toString(), "Log opponent amount is not correct");

            // Check that bet has been set to 0
            let game = await instance.games.call(hash);
            assert.strictEqual(game['bet'].toString(), "0", "Game bet is not correct after revealing result");

            // Check that the balances are set correctly
            let balanceAlice = await instance.balances.call(alice);
            let balanceBob = await instance.balances.call(bob);
            assert.strictEqual(balanceAlice.toString(), quantityBN.toString(), "Balance for Alice is not correct");
            assert.strictEqual(balanceBob.toString(), quantityBN.toString(), "Balance for Bob is not correct");
        });

        it("should not let reveal twice", async function () {

            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await instance.revealResult(bob, move.rock, password, {from: alice});
            await expectedExceptionPromise(async function() {
                return instance.revealResult(bob, move.rock, password, {from: alice});
            });
        });

        it("should not let reveal when called by wrong address", async function () {

            await expectedExceptionPromise(async function() {
                return instance.revealResult(bob, move.rock, password, {from: carol});
            });
        });

        it("should not let reveal with wrong password", async function () {

            await expectedExceptionPromise(async function() {
                return instance.revealResult(bob, move.rock, password2, {from: alice});
            });
        });

        it("should not let reveal after expiration", async function () {

            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*24*3600], id: 0}, err => console.log);
            await expectedExceptionPromise(async function() {
                return instance.revealResult(bob, move.rock, password, {from: alice});
            });
        });
    });

    describe("withdrawing funds", function () {

        beforeEach("add a new game", async function() {

            await instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await instance.revealResult(bob, move.rock, password, {from: alice});
        });

        it("should let alice withdraw her balance", async function () {

            let aliceBalanceBN = toBN(await web3.eth.getBalance(alice));
            let txObj = await instance.withdrawFunds({from: alice});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['who'], alice, "Log who is not correct");
            assert.strictEqual(args['amount'].toString(), quantity2BN.toString(), "Log amount is not correct");

            // Check new alice balance
            let txCostBN = await getTransactionCost(txObj);
            let aliceNewBalanceBN = toBN(await web3.eth.getBalance(alice));
            let newBalanceCalculation = aliceBalanceBN.sub(txCostBN).add(quantity2BN);
            assert.strictEqual(aliceNewBalanceBN.toString(), newBalanceCalculation.toString(), "Alice did not receive the right amount of funds");
        });

        it("should not let bob to withdraw his balance", async function () {

            await expectedExceptionPromise(async function() {
                return instance.withdrawFunds({from: bob});
            });
        });
    });

    describe("claim after expiration", function () {

        beforeEach("add a new game", async function() {

            await instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
        });

        it("should let alice claim expiration if opponent did not show up", async function () {

            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*24*3600], id: 0}, err => console.log);
            let aliceBalanceBN = toBN(await web3.eth.getBalance(alice));
            let txObj = await instance.claimAfterExpiration(hash, {from: alice});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log hash is not correct");
            assert.strictEqual(args['who'], alice, "Log who is not correct");
            assert.strictEqual(args['amount'].toString(), quantityBN.toString(), "Log amount is not correct");

            // Check new alice balance
            let txCostBN = await getTransactionCost(txObj);
            let aliceNewBalanceBN = toBN(await web3.eth.getBalance(alice));
            let newBalanceCalculation = aliceBalanceBN.sub(txCostBN).add(quantityBN);
            assert.strictEqual(aliceNewBalanceBN.toString(), newBalanceCalculation.toString(), "Alice did not receive the right amount of funds");
        });

        it("should not let alice claim expiration if opponent did show up", async function () {

            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*24*3600], id: 0}, err => console.log);
            await expectedExceptionPromise(async function() {
                return instance.claimAfterExpiration(hash, {from: alice});
            });
        });

        it("should let bob claim expiration if alice did not reveal", async function () {

            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*24*3600], id: 0}, err => console.log);
            let bobBalanceBN = toBN(await web3.eth.getBalance(bob));
            let txObj = await instance.claimAfterExpiration(hash, {from: bob});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log hash is not correct");
            assert.strictEqual(args['who'], bob, "Log who is not correct");
            assert.strictEqual(args['amount'].toString(), quantity2BN.toString(), "Log amount is not correct");

            // Check new alice balance
            let txCostBN = await getTransactionCost(txObj);
            let bobNewBalanceBN = toBN(await web3.eth.getBalance(bob));
            let newBalanceCalculation = bobBalanceBN.sub(txCostBN).add(quantity2BN);
            assert.strictEqual(bobNewBalanceBN.toString(), newBalanceCalculation.toString(), "Alice did not receive the right amount of funds");
        });

        it("should not let bob claim expiration if alice did reveal", async function () {

            await instance.setOpponentMove(hash, move.scissors, {from: bob, value: quantity});
            await instance.revealResult(bob, move.rock, password, {from: alice});
            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*24*3600], id: 0}, err => console.log);
            await expectedExceptionPromise(async function() {
                return instance.claimAfterExpiration(hash, {from: bob});
            });
        });
    });

    describe("when contract is paused or killed", function() {

        it("should not let use the contract while paused", async function() {

            let txObj = await instance.pause({from: owner});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            assert.strictEqual(txObj.logs[0].args['account'], owner, "Log account that paused not correct");
            let isPaused = await instance.isPaused();
            assert.strictEqual(isPaused, true, "Contract should be paused");
            await expectedExceptionPromise(function() {
                return instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
            });
            isPaused = await instance.isPaused();
            assert.strictEqual(isPaused, true, "Contract should not be paused");
        });

        it("should not let use the contract if starting paused", async function() {

            let instance2 = await RockPaperScissors.new(true, {from: owner});
            await expectedExceptionPromise(function() {
                return instance2.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
            });
        });

        it("should not let once the contract killSwitch has been activated", async function() {

            let txObj = await instance.kill({from: owner});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            await expectedExceptionPromise(function() {
                return instance.newGame(hash, bob, secondsInDay, {from: alice, value: quantity});
            });
        });

        it("should not let any other than owner to kill the contract", async function() {

            return await expectedExceptionPromise(function() {
                return instance.kill({from: alice});
            });
        });
    });
});