/**
 * @link https://github.com/videlalvaro/rabbitpubsub/blob/master/app.js
 * @author Richard Fussenegger
 */
require('cf-autoconfig');

var port = process.env.PORT || 3000;
var host = process.env.HOST || 'localhost';

var express = require('express');
var http = require('http');
var path = require('path');
var redis = require('redis');
var amqp = require('amqp').createConnection({});
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var chatExchange;
var redisClient = redis.createClient();
var RedisStore = require('connect-redis')(express);
var sessionStore = new RedisStore({ client: redisClient });
var cookieSecret = 'yDj9Fs7DaVVxZdZcuOh0';
var cookieParser = express.cookieParser(cookieSecret);
var SessionSocket = require('session.socket.io');
var sessionSockets = new SessionSocket(io, sessionStore, cookieParser, 'jsessionid');
var ejsHelper = (function EJSHelper() {
  var
    _projectTitle = 'AMQPChat',
    _navbarPoints = [
      { href: '/', text: 'Home' },
      { href: '/about', text: 'About' },
      { href: '/user', text: 'User' }
    ],
    self = {
      getTitle: function EJSHelperGetTitle(title) {
        return (title ? title + ' | ' : '') + _projectTitle;
      },
      getNavbar: function EJSHelperGetNavbar(active) {
        for (var i = 0; i < _navbarPoints.length; i++) {
          _navbarPoints[i].active = _navbarPoints[i].text === active || _navbarPoints[i].href === active ? ' class="active"' : '';
        }
        return _navbarPoints;
      },
      render: function EJSHelperRender(res, view, options) {
        res.render(view, {
          view: view,
          title: self.getTitle(options.title || null),
          navbar: self.getNavbar(options.active || null),
          user: options.user || null
        });
      }
    };
  return self;
})();

amqp.on('ready', function () {
  chatExchange = amqp.exchange('chatExchange', { type: 'fanout' });
});

// Configure socket.io
io.set('transports', [ 'xhr-polling' ]).set('log level', 1);

// Configure our app and set up routes.
app
  .configure(function () {
    this
      .set('port', port)
      .set('views', __dirname + '/views')
      .set('view engine', 'ejs')
      .use(cookieParser)
      .use(express.logger('dev'))
      .use(express.bodyParser())
      .use(express.methodOverride())
      .use(express.session({ store: sessionStore, key: 'jsessionid', secret: cookieSecret }))
      .use(express.static(path.join(__dirname, 'public')))
      .use(this.router);
  })
  .configure('development', function () {
    this.use(express.errorHandler());
  })
  .get('/', function (req, res) {
    var user;
    try {
      user = req.session.user;
      res.session.regenerate(function (error) {
        req.session.user = user;
        ejsHelper.render(res, 'index', { active: 'Home', user: user });
      });
    } catch (e) {
      res.redirect('/user');
    }
  })
  .get('/user', function (req, res) {
    if (req.session && req.session.user) {
      // @todo Render user profile page.
    } else {
      ejsHelper.render(res, 'login', { title: 'Login' });
    }
  })
  .post('/user/logout', function (req, res) {
    res.redirect('/user');
  })
  .post('/user/register', function (req, res) {
    var _genPass = function () {
      var
        chars = '',
        length = 8,
        pass = '',
        countChars = 0,
        countNums = 0,
        rNum;
      for (var i = 0; i < length; i++) {
        if ((Math.floor(Math.random() * 2) === 0) && countNums < 3 || countChars >= 5) {
          rNum = Math.floor(Math.random() * 10);
          pass += rnum;
          countNums++;
        } else {
          rNum = Math.floor(Math.random() * chars.length);
          pass += chars.substring(rNum, rNum + 1);
          countChars++;
        }
      }
      return pass;
    };
    res.redirect('/user');
  })
  .post('/user/login', function (req, res) {
    res.redirect('/user');
  })
;

sessionSockets.on('connection', function (error, socket, session) {
  socket.on('chat', function (data) {
    var msg = JSON.parse(data);
    chatExchange.publish('', { action: 'message', user: session.user, msg: msg.msg });
  });
  socket.on('join', function () {
    chatExchange.publish('', { action: 'control', user: session.user, msg: ' joined the channel.' });
  });
  amqp.queue('', { exclusive: true }, function (q) {
    q.bind('chatExchange', '');
    q.subscribe(function (message) {
      socket.emit('chat', JSON.stringify(message));
    });
  });
});

server.listen(port, function () {
  console.log('Express server listening on port ' + port);
});