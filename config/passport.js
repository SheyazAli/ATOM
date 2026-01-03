const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require(__basedir +'/db/user');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        let user = await User.findOne({ email });

        // If user does not exist → create
        if (!user) {
          user = await User.create({
            first_name: profile.name.givenName,
            last_name: profile.name.familyName,
            email,
            password: 'GOOGLE_AUTH', // dummy
            isVerified: true
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
