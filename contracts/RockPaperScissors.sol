pragma solidity >=0.4.21 <0.6.0;

import "./Pausable.sol";
import "./SafeMath.sol";


contract RockPaperScissors is Pausable {
    using SafeMath for uint;

    enum Move {Unset, Rock, Paper, Scissors}

    struct Game {
        address creator;
        address opponent;
        uint bet;
        uint expiration;
        Move opponentMove;
    }

    uint constant public maxExpirationSeconds = 10 * 1 days;

    mapping(bytes32 => Game) public games;  // the bytes32 is the encoded move of the creator
    mapping(address => uint) public balances;

    event LogNewGame(bytes32 indexed hash, address indexed creator, address indexed opponent, uint bet, uint expiration);
    event LogOpponentMove(bytes32 indexed hash, Move move, uint newExpiration);
    event LogRevealResult(bytes32 indexed hash, address indexed creator, address indexed opponent, uint creatorAmount, uint opponentAmount);
    event LogWithdraw(address indexed who, uint amount);
    event LogClaimAfterExpiration(bytes32 indexed hash, address indexed who, uint amount);

    /**
     * Constructor
     */
    constructor (bool paused) Pausable(paused) public {}

    /**
     * Calculate the hash for the creator of a game
     */
    function generateHash(address _opponent, Move _creatorMove, bytes32 _password) public view returns(bytes32) {
        require(_opponent != address(0), "Not a valid opponent address");
        require(_creatorMove != Move.Unset, "Wrong move");
        require(_password != bytes32(0), "Password not set");
        return keccak256(abi.encodePacked(address(this), msg.sender, _opponent, _creatorMove, _password));
    }

    /**
     * Create a game
     */
    function newGame(bytes32 _hash, address _opponent, uint _seconds) public payable whenNotPaused {
        require(_hash != bytes32(0), "Not a valid hash");
        require(_opponent != address(0), "Not a valid creator address");
        require(_seconds > 0, "You must set a number of seconds to expiration");
        require(_seconds <= maxExpirationSeconds, "Cannot set more than maxExpirationDays");
        require(msg.value > 0, "You must send something to bet");
        require(games[_hash].expiration == 0, "You already used this password in this contract");

        uint expiration = now.add(_seconds);

        games[_hash] = Game({
            creator: msg.sender,
            opponent: _opponent,
            bet: msg.value,
            expiration: expiration,
            opponentMove: Move.Unset
        });

        emit LogNewGame(_hash, msg.sender, _opponent, msg.value, expiration);
    }

    /**
     * Opponent will do his move while paying the right amount
     */
    function setOpponentMove(bytes32 _hash, Move _move) public payable whenNotPaused {
        require(_hash != bytes32(0), "Not a valid game hash");
        require(_move != Move.Unset, "Not a valid move");

        Game storage game = games[_hash];
        require(game.opponent == msg.sender, "You are not the right opponent for the game");
        require(game.bet > 0, "Game already claimed");
        require(game.bet == msg.value, "You must send the right amount for this game");
        require(now <= game.expiration, "Game already expired");
        require(game.opponentMove == Move.Unset, "Move already set");

        game.opponentMove = _move;
        game.expiration = now.add(1 days);  // New expiry is one day to avoid last moment play and claimAfterExpiration

        emit LogOpponentMove(_hash, _move, game.expiration);
    }

    /**
     * Creator reveals the result by showing his move, he could avoid showing his move but then opponent can
     * claim bet after expiry.
     */
    function revealResult(address _opponent, Move _creatorMove, bytes32 _creatorPassword) public whenNotPaused {
        bytes32 hash = generateHash(_opponent, _creatorMove, _creatorPassword);
        Game storage game = games[hash];

        uint bet = game.bet;
        Move opponentMove = game.opponentMove;

        require(bet > 0, "Game already claimed");
        require(now <= game.expiration, "Game already expired");
        require(opponentMove > Move.Unset, "Opponent did not set his move yet");

        // Set bet to 0 so cannot reveal twice
        game.bet = 0;

        uint creatorAmount;
        uint opponentAmount;

        // Reveal the move
        if (_creatorMove == opponentMove) {
            // Draw
            creatorAmount = bet;
            opponentAmount = bet;
        } else if (_creatorMove == Move.Rock && opponentMove == Move.Scissors || _creatorMove == Move.Scissors && opponentMove == Move.Paper || _creatorMove == Move.Paper && opponentMove == Move.Rock) {
            // Creator wins
            creatorAmount = bet.add(bet);
        } else {
            // Opponent wins
            opponentAmount = bet.add(bet);
        }

        balances[msg.sender] = balances[msg.sender].add(creatorAmount);
        balances[_opponent] = balances[_opponent].add(opponentAmount);

        emit LogRevealResult(hash, msg.sender, _opponent, creatorAmount, opponentAmount);
    }

    /**
     * Withdraw the funds
     */
    function withdrawFunds() public whenNotPaused {
        uint toWithdraw = balances[msg.sender];
        require(toWithdraw > 0, "There is no balance to withdraw");
        emit LogWithdraw(msg.sender, toWithdraw);
        balances[msg.sender] = 0;
        msg.sender.transfer(toWithdraw);
    }

    /**
     * Creator and opponent can claim the price after expiration.
     */
    function claimAfterExpiration(bytes32 _hash) public whenNotPaused {
        Game storage game = games[_hash];
        require(msg.sender == game.opponent || msg.sender == game.creator, "You are not allowed to claim");
        require(game.bet > 0, "Game has been already claimed");
        require(now > game.expiration, "Game has not been expired yet");

        uint toWithdraw = game.bet;

        if (msg.sender == game.creator) {
            // In case opponent did not show up
            require(game.opponentMove == Move.Unset, "Opponent already showed up");
            game.bet = 0;
            msg.sender.transfer(toWithdraw);
        } else if (msg.sender == game.opponent) {
            // In case opponent played but creator did not reveal
            game.bet = 0;
            toWithdraw = toWithdraw.add(toWithdraw);
            msg.sender.transfer(toWithdraw);
        }

        emit LogClaimAfterExpiration(_hash, msg.sender, toWithdraw);
    }
}