module.exports = {
  reporter: function(results) {
    console.log("Reporter says: " + results[0].message);
  }
}