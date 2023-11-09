const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import CheckFormats from './CheckFormats';
import { useEffect, useState } from 'react';
import { Button, Form, Icon, Input } from 'semantic-ui-react';
import Header from './components/Header';
import Footer from './components/Footer';
import Loading from './components/Loading';
import PreviewDeco from './components/PreviewDeco';
import LouisPreview from './components/LouisPreview';
import FormatDropdown from './components/FormatDropdown';
import VisuelDropdown from './components/VisuelDropdown';
import ImageRender from './components/ImageRender';
import Place from './components/Place';
import FormatTauro from './components/FormatTauro';
import InfoMessage from './components/InfoMessage';
import Log from './components/Log';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(['']);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [formatTauro, setFormatTauro] = useState(['']);
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [selectedFormatTauro, setSelectedFormatTauro] = useState('');
  const [version, setVersion] = useState(null);
  const [isloadingFormatTauro, setLoadingFormatTauro] = useState(true);
  const [files, setFiles] = useState([{ name: '', fileSize: '' }]);
  const [isFile, setIsFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isProcessLoading, setIsProcessLoading] = useState(false);
  const [timeProcess, setTimeProcess] = useState({});
  const [isFooter, setIsFooter] = useState(false);
  const [isShowPdf, setIsShowPdf] = useState(false);
  const [isShowJpg, setIsShowJpg] = useState(false);
  const [isShowLouis, setIsShowLouis] = useState(false);
  const [isShowLog, setIsShowLog] = useState(false);
  const [dataLog, setDataLog] = useState([]);
  const [validate, setValidate] = useState(true);
  const [warnMsg, setWarnMsg] = useState({ hidden: true, header: '', msg: '' });
  const [error, setError] = useState({
    formatTauro: false,
    format: false,
    visuel: false,
    numCmd: false,
    ville: false,
    ex: false,
  });

  //Get Format Tauro
  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/formatsTauro`, { method: 'GET', headers: { Accept: 'Application/json' } })
      .then((res) => res.json())
      .then((res) => {
        let arr = [];
        res.map((v) => {
          arr.push(v.value);
        }),
          setFormatTauro(arr);
        setLoadingFormatTauro(false);
      })
      .catch((err) => console.log(err));
  }, [selectedFormatTauro]);

  //Get App version
  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/process`, { method: 'GET', headers: { Accept: 'Application/json' } })
      .then((res) => res.json())
      .then((res) => {
        setVersion(res.version);
      })
      .catch((err) => console.log(err));
  }, []);

  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/path`, {
      method: 'GET',
      headers: {
        Accept: 'Application/json',
      },
    })
      .then((res) => res.json())
      .then((res) => {
        setData(res.map((res) => res));
        setIsLoading(false);
        setIsFooter(false);
      })
      .catch((err) => console.log(err));
  }, []);

  let timeoutId;
  const handleGetProcess = async () => {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/process`, {
        method: 'GET',
        headers: { Accept: 'Application/json' },
      });
      const data = await res.json();

      if (data.success) {
        const update = {
          pdf: data.pdfTime,
          jpg: data.jpgTime,
          jpgPath: data.jpgPath,
          fileName: data.fileName,
          time: data.time,
          version: data.version,
        };
        setDataLog((curr) => [
          ...curr,
          {
            id: curr.length + 1,
            time: update.time,
            value: update.fileName,
          },
        ]);
        setIsProcessLoading(false);
        setIsFooter(true);
        setIsShowJpg(true);
        setTimeProcess((timeProcess) => ({ ...timeProcess, ...update }));
      } else {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          handleGetProcess();
        }, 1000);
      }
    } catch (err) {
      console.log(err);
    }
  };

  // Submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const data = {
      allFormatTauro: formatTauro,
      formatTauro: selectedFormatTauro,
      format: selectedFormat,
      visuel: selectedFile,
      numCmd: formData.get('numCmd'),
      ville: formData.get('ville'),
      ex: formData.get('ex'),
    };

    //POST data
    fetch(`http://${HOST}:${PORT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => res);

    // Reset form
    form.reset();
    setSelectedFile('');
    setSelectedFormat('');

    // Hide view
    setIsShowPdf(false);
    setIsShowLouis(false);
    setIsShowJpg(false);
    setIsShowLog(false);

    //Set Loading Process
    setIsProcessLoading(true);

    //Check response
    handleGetProcess();
  };

  // Ajout Format Plaque Tauro
  const handleToggleAddFormat = () => {
    showAddFormat ? setShowAddFormat(false) : setShowAddFormat(true);
    if (showAddFormat) {
      const value = document.getElementById('addFormatTauro').value;
      if (value !== '') {
        setFormatTauro((curr) => [...curr, value]);
      }
    }
  };

  return (
    <div className="container">
      {/* LOADING */}
      <Loading active={isProcessLoading} />

      {/* Header Logo */}
      <Header appVersion={version} />

      {/* Session Input */}
      <div className="main">
        <Form onSubmit={handleSubmit} className="form">
          {/* Warning Message */}
          <InfoMessage isHidden={warnMsg.hidden} title={warnMsg.header} text={warnMsg.msg} />

          {/* Format Tauro */}
          <Form.Field className="format-tauro" required error={error.formatTauro}>
            <label htmlFor="FormatTauro">Répertoires Tauro</label>
            <FormatTauro
              error={error.formatTauro}
              isLoading={isloadingFormatTauro}
              formatTauro={formatTauro}
              onValue={(e, data) => {
                setSelectedFormatTauro(data.value);
                CheckFormats(data.value, selectedFormat) == false
                  ? setWarnMsg({
                      hidden: false,
                      header: 'Problème format',
                      msg: 'Le format du visuel est plus grand que celui de la plaque.',
                    })
                  : setWarnMsg({ hidden: true });
                if (data.value == '' || data.value == undefined) {
                  setError({ ...error, formatTauro: true });
                } else {
                  setError({ ...error, formatTauro: false });
                }
              }}
            />
            <Button
              attached="bottom"
              className="add-button"
              type="button"
              icon="add"
              color="grey"
              size="mini"
              onClick={handleToggleAddFormat}
            />

            {showAddFormat && (
              <Input id="addFormatTauro" size="small" label="Add format" placeholder="Deco_Std_FORMAT" />
            )}
          </Form.Field>

          {/* Format */}
          <Form.Field required error={error.format}>
            <label htmlFor="format">Format</label>
            <FormatDropdown
              error={error.format}
              id="format"
              className="format"
              isLoading={isLoading}
              data={data}
              value={selectedFormat}
              text={selectedFormat}
              selectedFormat={selectedFormat}
              onSelectFormat={(e, v) => {
                const value = isLoading ? 'Loading..' : data.find((x) => x.path === v.value);
                setSelectedFormat(value.name);
                setFiles(value.files);
                setIsFile(true);
                setIsFooter(false);
                CheckFormats(selectedFormatTauro, value.name) == false
                  ? setWarnMsg({
                      hidden: false,
                      header: 'Problème format',
                      msg: 'Le format du visuel est plus grand que celui de la plaque.',
                    })
                  : setWarnMsg({ hidden: true });
                if (value.name == '' || value.name == undefined) {
                  setError({ ...error, format: true });
                } else {
                  setError({ ...error, format: false });
                }
              }}
            />
          </Form.Field>

          {/* Visu */}
          <Form.Field required error={error.visuel}>
            <label htmlFor="visuel">Visuel</label>
            <VisuelDropdown
              error={error.visuel}
              id="visuel"
              className="visuel"
              isFile={isFile}
              files={files}
              value={selectedFile}
              text={selectedFile}
              selectedFile={selectedFile}
              onSelectedFile={(value) => {
                setSelectedFile(value.name);
                setFileSize(value.size);
                setIsShowPdf(true);
                setIsShowLouis(false);
                setIsShowJpg(false);
                setIsShowLog(false);
                if (value.name == '' || value.name == undefined) {
                  setError({ ...error, visuel: true });
                  setValidate(true);
                } else {
                  setError({ ...error, visuel: false });
                  setValidate(false);
                }
              }}
            />
            <p style={{ fontSize: '10px', textAlign: 'right', width: '300px', marginTop: '2px' }}>{fileSize}</p>
          </Form.Field>

          {/* Infos commande */}
          <Form.Field required error={error.numCmd}>
            <label htmlFor="numCmd">N° commande</label>
            <Input
              error={error.numCmd}
              id="numCmd"
              name="numCmd"
              type="number"
              placeholder="N° commande"
              onChange={(e, data) => {
                data.value;
                if (data.value.length < 5) {
                  setError({ ...error, numCmd: true });
                } else {
                  setError({ ...error, numCmd: false });
                }
              }}
            />
          </Form.Field>
          <Form.Field required error={error.ville}>
            <label htmlFor="ville">Ville / Mag</label>
            <Place
              onValue={(value) => {
                value;
                if (value.length < 1) {
                  setError({ ...error, ville: true });
                } else {
                  setError({ ...error, ville: false });
                }
              }}
            />
          </Form.Field>
          <Form.Field required error={error.ex}>
            <label htmlFor="ex">Ex</label>
            <Input
              error={error.ex}
              id="ex"
              name="ex"
              type="number"
              placeholder="Ex"
              onChange={(e, data) => {
                data.value;
                if (data.value < 1 || data.value == '') {
                  setError({ ...error, ex: true });
                } else {
                  setError({ ...error, ex: false });
                }
              }}
            />
          </Form.Field>

          <div className="button-form">
            <Button disabled={validate} primary compact inverted type="submit" content="Valider" />

            <Button
              content="Louis"
              compact
              inverted
              color="green"
              type="button"
              onClick={() => {
                if (!isShowLouis) {
                  setIsShowLouis(true);
                  setIsShowPdf(false);
                  setIsShowJpg(false);
                  setIsShowLog(false);
                } else {
                  setIsShowLouis(false);
                }
              }}
            />

            <Button
              compact
              inverted
              color="orange"
              type="button"
              onClick={() => {
                if (!isShowJpg) {
                  setIsShowJpg(true);
                  setIsShowLouis(false);
                  setIsShowPdf(false);
                  setIsShowLog(false);
                } else {
                  setIsShowJpg(false);
                }
              }}
            >
              <Icon className="image icon" size="large" fitted />
            </Button>
            <Button
              type="button"
              icon="file text"
              color="vk"
              toggle
              onClick={() => {
                if (!isShowLog) {
                  setIsShowLog(true);
                  setIsShowJpg(false);
                  setIsShowLouis(false);
                  setIsShowPdf(false);
                } else {
                  setIsShowLog(false);
                }
              }}
            />
          </div>
        </Form>
      </div>

      {/* Preview visu */}
      <PreviewDeco fileSelected={selectedFile} show={isShowPdf} />

      {/*  Louis Files */}
      <LouisPreview show={isShowLouis} />

      {/*  Jpg */}
      <ImageRender active={isShowJpg} src={timeProcess.jpgPath} />

      {/* Log */}
      <Log show={isShowLog} data={dataLog} />

      {/* FOOTER */}
      <Footer active={!isFooter} timePdf={timeProcess.pdf} timeJpg={timeProcess.jpg} />
    </div>
  );
}

export default App;
