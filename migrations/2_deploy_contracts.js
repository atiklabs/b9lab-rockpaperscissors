const RockPaperScissors = artifacts.require("RockPaperScissors.sol");

module.exports = function(deployer) {
    return deployer.deploy(RockPaperScissors, false);
};
