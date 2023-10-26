const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;

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

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(['']);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [formatTauro, setFormatTauro] = useState(['']);
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [selectedFormatTauro, setSelectedFormatTauro] = useState('');
  const [version, setVersion] = useState('');
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
  const [validateForm, setValidateForm] = useState({
    session: false,
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
  }, []);

  //Get App version
  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/process`, { method: 'GET', headers: { Accept: 'Application/json' } })
      .then((res) => res.json())
      .then((res) => setVersion(res.version))
      .catch((err) => console.log(err));
  });

  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/path`, {
      method: 'GET',
      headers: {
        Accept: 'Application/json',
      },
    })
      .then((res) => res.json())
      .then((res) => {
        setData(res.map((res) => res).slice(3, -5));
        setIsLoading(false);
        setIsFooter(false);
      })
      .catch((err) => console.log(err));
  }, []);

  const handleGetProcess = () => {
    let update = {};
    fetch(`http://${HOST}:${PORT}/process`, { method: 'GET', headers: { Accept: 'Application/json' } })
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          update = { pdf: res.pdfTime, jpg: res.jpgTime, jpgPath: res.jpgPath, version: res.version };
          setIsProcessLoading(false);
          setIsFooter(true);
          setIsShowJpg(true);
        } else {
          handleGetProcess();
        }
        setTimeProcess((timeProcess) => ({ ...timeProcess, ...update }));
      })
      .catch((err) => console.log(err));
  };

  // Submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const data = {
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

    //Set Loading Process
    setIsProcessLoading(true);

    //Check response
    handleGetProcess();
  };

  const handleToggleAddFormat = () => {
    showAddFormat ? setShowAddFormat(false) : setShowAddFormat(true);
  };
  return (
    <div className="container">
      {/* LOADING */}
      <Loading active={isProcessLoading} />

      {/* Header Logo */}
      <Header appVersion={version} />

      {/* Session Input */}
      <div className="main">
        <Form onSubmit={handleSubmit} className="form" warning success error>
          <Form.Field className="format-tauro" required error={validateForm.session}>
            <label htmlFor="session">Répertoires Tauro</label>
            <FormatTauro
              isLoading={isloadingFormatTauro}
              onValue={(data) => {
                setSelectedFormatTauro(data.value);
              }}
              formatTauro={formatTauro}
            />
            <Button
              className="add-button"
              attached="bottom"
              type="button"
              icon="add"
              color="grey"
              size="mini"
              onClick={handleToggleAddFormat}
            />

            {showAddFormat && (
              <Input
                size="small"
                label="Add format"
                onChange={(e, data) => {
                  let update = [];
                  const value = data.value;
                  update.push(value);
                  setFormatTauro((curr) => [...curr, ...update]);
                }}
              />
            )}
          </Form.Field>

          {/* Format */}
          <Form.Field required error={validateForm.format}>
            <label htmlFor="format">Format</label>
            <FormatDropdown
              id="format"
              className="format"
              isLoading={isLoading}
              data={data}
              value={selectedFormat}
              text={selectedFormat}
              selectedFormat={selectedFormat}
              onSelectFormat={(v) => {
                const value = isLoading ? 'Loading..' : data.find((x) => x.path === v.value);
                setSelectedFormat(value.name);
                setFiles(value.files);
                setIsFile(true);
                setIsFooter(false);
              }}
            />
          </Form.Field>
          {/* Visu */}
          <Form.Field required error={validateForm.visuel}>
            <label htmlFor="visuel">Visuel</label>
            <VisuelDropdown
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
              }}
            />
            <p style={{ fontSize: '10px', textAlign: 'right', width: '300px', marginTop: '2px' }}>{fileSize}</p>
          </Form.Field>

          {/* Infos commande */}
          <Form.Field required error={validateForm.numCmd}>
            <label htmlFor="numCmd">N° commande</label>
            <Input
              id="numCmd"
              name="numCmd"
              type="number"
              placeholder="N° commande"
              onChange={(e, data) => {
                const value = data.value;
                value !== '' ? setValidateForm({ numCmd: false }) : setValidateForm({ numCmd: true });
                console.log(e);
              }}
            />
          </Form.Field>
          <Form.Field required error={validateForm.ville}>
            <label htmlFor="ville">Ville / Mag</label>
            <Place
              onValue={(value) => {
                value !== '' ? setValidateForm({ ville: false }) : setValidateForm({ ville: true });
                console.log(value);
              }}
            />
          </Form.Field>
          <Form.Field required error={validateForm.ex}>
            <label htmlFor="ex">Ex</label>
            <Input
              id="ex"
              name="ex"
              type="number"
              placeholder="Ex"
              onChange={(e, data) => {
                console.log(data);
                const value = data.value;
                value !== '' ? setValidateForm({ ex: false }) : setValidateForm({ ex: true });
              }}
            />
          </Form.Field>

          <div className="button-form">
            <Button primary compact inverted type="submit">
              Valider
            </Button>
            <Button
              compact
              inverted
              color="green"
              type="button"
              onClick={() => {
                if (!isShowLouis) {
                  setIsShowLouis(true);
                  setIsShowPdf(false);
                  setIsShowJpg(false);
                } else {
                  setIsShowLouis(false);
                }
              }}
            >
              Louis
            </Button>
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
                } else {
                  setIsShowJpg(false);
                }
              }}
            >
              <Icon className="image icon" size="large" fitted />
            </Button>
          </div>
        </Form>
      </div>
      {/* Preview visu */}
      <PreviewDeco fileSelected={selectedFile} show={isShowPdf} />

      {/* Preview Louis Files */}
      <LouisPreview show={isShowLouis} />

      {/* Preview Jpg */}
      <ImageRender active={isShowJpg} src={timeProcess.jpgPath} />

      {/* FOOTER */}
      <Footer active={!isFooter} appVersion={timeProcess.version} timePdf={timeProcess.pdf} timeJpg={timeProcess.jpg} />
    </div>
  );
}

export default App;
