const getUserFromData = (data, id, type) => {
  const user = {
    id,
    type,
    userName: data.userName,
  };

  return user;
};
module.exports = { getUserFromData };

//   create JWT token
