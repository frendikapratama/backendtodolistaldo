import User from "../models/User.js";

export async function findOrCreateUser(email, userData = {}) {
  let user = await User.findOne({ email });

  if (!user) {
    const { username, password, noHp, departemen, divisi } = userData;

    if (!username || !password || !noHp) {
      return {
        success: false,
        message:
          "Data registrasi tidak lengkap (username, password, noHp, departemen, divisi wajib diisi)",
      };
    }

    user = await User.create({
      username,
      email,
      password,
      noHp,

      departemen,
      divisi,
    });

    console.log(`🆕 User baru dibuat: ${email}`);
    return { success: true, user, isNewUser: true };
  }

  return { success: true, user, isNewUser: false };
}
