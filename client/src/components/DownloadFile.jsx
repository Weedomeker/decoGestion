import PropTypes from 'prop-types';

import { Button } from 'semantic-ui-react';

const DownloadFile = ({ urlFile, fileName }) => {
  const onButtonClick = (e) => {
    e.preventDefault();
    const extension = e.target.value;
    fetch(urlFile + '/' + fileName + '.' + extension, {
      method: 'GET',
      headers: {
        'Content-Type': `application/${extension}`,
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName + '.' + extension;
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      });
  };

  return (
    <div>
      <Button compact size="mini" type="button" content="dxf" color="vk" value="dxf" onClick={onButtonClick} />
      <Button compact size="mini" type="button" content="svg" color="red" value="svg" onClick={onButtonClick} />
    </div>
  );
};

DownloadFile.propTypes = {
  urlFile: PropTypes.string,
  fileName: PropTypes.string,
};

export default DownloadFile;
