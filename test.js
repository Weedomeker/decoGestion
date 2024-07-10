let deco = 'DIBOND 100X205-FEUILLAGE AUTOMNAL 100x200_00000000_S_.pdf';

function CleanStringDeco(name) {
  name.replace(/[^a-zA-Z0-9 ]/g, ' ');
  const [dibond, format] = name.match(/\d{3}x\d{3}/gi);
  const ref = parseInt(name.match(/\d{8}/)[0]);
  const visualName = name.match(/\w{4,}/gi)[2];

  return { visualName, ref, format, dibond };
}

console.log(Object.values(CleanStringDeco(deco)).join(' '));
