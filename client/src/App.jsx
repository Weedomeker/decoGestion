const HOST = import.meta.env.VITE_HOST;
const PORT = import.meta.env.VITE_PORT;
import { useEffect, useState } from 'react';
import { Button, ButtonContent, Checkbox, Form, Icon, Input } from 'semantic-ui-react';
import CheckFormats from './CheckFormats';
import Config from './components/Config';
import Footer from './components/Footer';
import FormatDropdown from './components/FormatDropdown';
import FormatTauro from './components/FormatTauro';
import Header from './components/Header';
import InfoMessage from './components/InfoMessage';
import InfoModal from './components/InfoModal';
import JobsList from './components/JobsList';
import LouisPreview from './components/LouisPreview';
import Place from './components/Place';
import PreviewDeco from './components/PreviewDeco';
import VisuelDropdown from './components/VisuelDropdown';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(['']);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [formatTauro, setFormatTauro] = useState(['']);
  const [checkProdBlanc, setCheckProdBlanc] = useState(false);
  const [checkGenerate, setCheckGenerate] = useState({
    cut: false,
    reg: false,
  });
  const [checkFolder, setCheckFolder] = useState('Standards');
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [selectedFormatTauro, setSelectedFormatTauro] = useState('');
  const [version, setVersion] = useState(null);
  const [isloadingFormatTauro, setLoadingFormatTauro] = useState(true);
  const [files, setFiles] = useState([{ name: '', fileSize: '' }]);
  const [isFile, setIsFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isFooter, setIsFooter] = useState(false);
  const [isShowPdf, setIsShowPdf] = useState(false);
  const [isShowLouis, setIsShowLouis] = useState(false);
  const [isShowJobsList, setIsShowJobsList] = useState(true);
  const [warnMsg, setWarnMsg] = useState({
    hidden: true,
    header: '',
    msg: '',
    icon: 'warning sign',
    color: 'red',
  });
  const [error, setError] = useState({
    formatTauro: false,
    format: false,
    visuel: false,
    numCmd: false,
    ville: false,
    ex: false,
  });
  const [enabled, setEnabled] = useState({
    format: true,
    visu: true,
    numCmd: true,
    ville: true,
    ex: true,
    validate: true,
  });
  const [perte, setPerte] = useState(0);
  const [modalData, setModalData] = useState({
    open: false,
    message: '',
    object: null,
    error: null,
  });

  //Get Format Tauro
  useEffect(() => {
    fetch(`http://${HOST}:${PORT}/formatsTauro`, {
      method: 'GET',
      headers: { Accept: 'Application/json' },
    })
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
    fetch(`http://${HOST}:${PORT}/process`, {
      method: 'GET',
      headers: {
        Accept: 'Application/json',
        'Content-Type': 'application/json',
      },
    })
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
        setData(
          res.map((res) => {
            return res;
          }),
        );
        setIsLoading(false);
        setIsFooter(false);
      })
      .catch((err) => console.log(err));
  }, [formatTauro, checkFolder]);

  const handleClose = () => {
    setModalData({
      open: false,
      message: '',
      object: null,
      error: null,
    });
  };

  const handleJobSubmit = async (e) => {
    e.preventDefault();
    const form = document.querySelector('form');
    const formData = new FormData(form);

    const data = {
      allFormatTauro: formatTauro,
      formatTauro: selectedFormatTauro,
      prodBlanc: checkProdBlanc,
      format: selectedFormat,
      visuel: selectedFile,
      numCmd: formData.get('numCmd'),
      ville: formData.get('ville'),
      ex: formData.get('ex'),
      perte: perte,
      regmarks: checkGenerate.reg,
      cut: checkGenerate.cut,
    };
    //POST data
    try {
      const response = await fetch(`http://${HOST}:${PORT}/add_job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Une erreur est survenue');
      }
      if (response.status === 200) {
        setIsShowJobsList(true);
        setModalData({
          open: true,
          message: result.message,
          object: result.object,
          error: null,
        });
      } else {
        setIsShowJobsList(true);
      }
    } catch (err) {
      setModalData({
        open: true,
        message: '',
        object: null,
        error: err.message,
      });
    }
  };

  // Ajout Format Plaque Tauro
  const handleToggleAddFormat = () => {
    showAddFormat ? setShowAddFormat(false) : setShowAddFormat(true);
    if (showAddFormat) {
      const value = 'Deco_Std_' + document.getElementById('addFormatTauro').value;
      if (value !== '') {
        setFormatTauro((curr) => [...curr, value]);
      }
    }
  };

  return (
    <div className="container">
      {/* Header Logo */}
      <Header appVersion={version} />

      {/* Session Input */}
      <div className="main">
        <Form className="form">
          {/* Warning Message */}
          <InfoMessage
            isHidden={warnMsg.hidden}
            title={warnMsg.header}
            text={warnMsg.msg}
            icon={warnMsg.icon}
            color={warnMsg.color}
          />
          {/* Format Tauro */}
          <Form.Field className="format-tauro" required error={error.formatTauro}>
            <label>Répertoires Tauro</label>
            <FormatTauro
              error={error.formatTauro}
              isLoading={isloadingFormatTauro}
              value={selectedFormatTauro}
              formatTauro={formatTauro}
              onValue={(e, data) => {
                setSelectedFormatTauro(data.value);
                if (CheckFormats(data.value, selectedFormat) && CheckFormats(data.value, selectedFormat).gap == true) {
                  setWarnMsg({
                    ...warnMsg,
                    hidden: false,
                    header: 'Attention au format',
                    msg: `Perte matère: (${CheckFormats(data.value, selectedFormat).surface}/m2)`,
                    icon: 'info circle',
                    color: 'yellow',
                  });
                } else if (
                  CheckFormats(data.value, selectedFormat) &&
                  CheckFormats(data.value, selectedFormat).isChecked == false
                ) {
                  //alerte
                  setWarnMsg({
                    ...warnMsg,
                    hidden: false,
                    header: 'Problème format',
                    msg: 'Le format du visuel est plus grand que celui de la plaque.',
                    icon: 'warning sign',
                    color: 'red',
                  });
                } else {
                  setWarnMsg({ ...warnMsg, hidden: true });
                }

                if (data.value == '') {
                  setEnabled({ ...enabled, format: false });
                  setError({ ...error, formatTauro: true });
                } else {
                  setEnabled({ ...enabled, format: false });
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

            {showAddFormat && <Input id="addFormatTauro" size="small" label="Add format" placeholder="ex: 101x215" />}
          </Form.Field>
          {/* PROD AVEC BLANC */}
          <Form.Field inline>
            <Checkbox
              name="Prod avec blanc"
              label="Prod avec blanc"
              checked={checkProdBlanc}
              onChange={(e, data) => setCheckProdBlanc(data.checked)}
            />
          </Form.Field>
          {/* GENERATE REGMARKS */}
          <Form.Field inline>
            <Checkbox
              name="Générer regmarks"
              label="Générer regmarks"
              checked={checkGenerate.reg}
              onChange={(e, data) => {
                setCheckGenerate({ ...checkGenerate, reg: data.checked });
              }}
            />
            {/* GENERATE CUT */}
            <Checkbox
              className="decoupe"
              name="Générer découpe"
              label="Générer découpe"
              checked={checkGenerate.cut}
              onChange={(e, data) => {
                setCheckGenerate({ cut: data.checked, reg: data.checked });
              }}
            />
          </Form.Field>

          {/* Format */}
          <Form.Field required error={error.format}>
            <Form.Group grouped widths={2}>
              <Form.Field inline>
                <Checkbox
                  name="folders"
                  label="Standards"
                  value="Standards"
                  checked={checkFolder === 'Standards'}
                  onChange={(e, data) => {
                    setCheckFolder(data.value);
                  }}
                />
                <Checkbox
                  name="folders"
                  label="Raccordables"
                  value="Raccordables"
                  checked={checkFolder === 'Raccordables'}
                  onChange={(e, data) => {
                    setCheckFolder(data.value);
                  }}
                />

                <Checkbox
                  name="folders"
                  label="Sur Mesures"
                  value="SurMesures"
                  checked={checkFolder === 'SurMesures'}
                  onChange={(e, data) => {
                    setCheckFolder(data.value);
                  }}
                />
                <Checkbox
                  name="folders"
                  label="Ecom"
                  value="Ecom"
                  checked={checkFolder === 'Ecom'}
                  onChange={(e, data) => {
                    setCheckFolder(data.value);
                  }}
                />
              </Form.Field>
            </Form.Group>

            <label>Formats {checkFolder}</label>
            <FormatDropdown
              enabled={enabled.format}
              error={error.format}
              id="format"
              className="format"
              isLoading={isLoading}
              data={data[0][checkFolder] || []}
              value={selectedFormat}
              text={selectedFormat}
              selectedFormat={selectedFormat}
              onSelectFormat={(e, v) => {
                const value = isLoading ? 'Loading..' : data[0][checkFolder].find((x) => x.path === v.value);
                setSelectedFormat(value.name);
                setFiles(value.files);
                setIsFile(true);
                setSelectedFile(null);
                setIsFooter(false);
                setEnabled({ ...enabled, visu: false });

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
            <label>Visuel</label>
            <VisuelDropdown
              enabled={enabled.visu}
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
                setIsShowJobsList(false);
                if (value.name == '' || value.name == undefined) {
                  setError({ ...error, visuel: true });
                } else {
                  setEnabled({ ...enabled, numCmd: false });
                  setError({ ...error, visuel: false });
                }

                //Check checkFormats
                if (
                  CheckFormats(selectedFormatTauro, value.name.split('/').pop()) &&
                  CheckFormats(selectedFormatTauro, value.name.split('/').pop()).gap == true
                ) {
                  setPerte(CheckFormats(selectedFormatTauro, value.name.split('/').pop()).surface);
                  setWarnMsg({
                    ...warnMsg,
                    hidden: false,
                    header: 'Attention au format',
                    msg: `Perte matière: ${CheckFormats(selectedFormatTauro, value.name.split('/').pop()).surface}/m2`,
                    icon: 'info circle',
                    color: 'yellow',
                  });
                } else if (CheckFormats(selectedFormatTauro, value.name.split('/').pop()) == undefined) {
                  setWarnMsg({
                    ...warnMsg,
                    hidden: false,
                    header: 'Problème format',
                    msg: 'Format du visuel introuvable. Attention au format de plaque choisit.',
                    icon: 'warning sign',
                    color: 'orange',
                  });
                } else if (CheckFormats(selectedFormatTauro, value.name.split('/').pop()).isChecked == false) {
                  setWarnMsg({
                    ...warnMsg,
                    hidden: false,
                    header: 'Problème format',
                    msg: 'Le format du visuel est plus grand que celui de la plaque.',
                    icon: 'warning sign',
                    color: 'red',
                  });
                } else {
                  setWarnMsg({ ...warnMsg, hidden: true });
                }
              }}
            />
            <p
              style={{
                fontSize: '10px',
                textAlign: 'right',
                width: '300px',
                marginTop: '2px',
              }}
            >
              {fileSize}
            </p>
          </Form.Field>
          {/* Infos commande */}
          <Form.Field required error={error.numCmd}>
            <label>N° commande</label>
            <Input
              disabled={enabled.numCmd}
              error={error.numCmd}
              id="numCmd"
              name="numCmd"
              type="number"
              placeholder="N° commande"
              onChange={(e, data) => {
                const maxValidate = (string) => {
                  return string.slice(0, 5);
                };
                if (data.value.length < 5) {
                  setError({ ...error, numCmd: true });
                } else {
                  setEnabled({ ...enabled, ville: false });
                  maxValidate(data.value);
                  setError({ ...error, numCmd: false });
                }
              }}
            />
          </Form.Field>
          {/* Ville / Mag */}
          <Form.Field required error={error.ville}>
            <label>Ville / Mag</label>
            <Place
              enabled={enabled.ville}
              onValue={(value) => {
                value;
                if (value.length < 1) {
                  setError({ ...error, ville: true });
                } else {
                  setEnabled({ ...enabled, ex: false, validate: false });
                  setError({ ...error, ville: false });
                }
              }}
            />
          </Form.Field>
          {/* Exemplaires */}
          <Form.Field>
            <label htmlFor="ex">Ex</label>
            <Input disabled={enabled.ex} id="ex" name="ex" type="number" defaultValue={1} />
          </Form.Field>
        </Form>
        <div className="container-buttons">
          <Button
            animated="fade"
            compact
            type="button"
            color="vk"
            onClick={(e) => {
              handleJobSubmit(e);
              if (!isShowJobsList) {
                setIsShowJobsList(true);
                setIsShowLouis(false);
                setIsShowPdf(false);
              } else {
                setIsShowJobsList(false);
              }
            }}
          >
            <ButtonContent visible>Ajouter</ButtonContent>
            <ButtonContent hidden>
              <Icon name="add" />
            </ButtonContent>
          </Button>
          <Button
            animated="fade"
            compact
            color="vk"
            type="button"
            onClick={() => {
              if (!isShowLouis) {
                setIsShowLouis(true);
                setIsShowPdf(false);
                setIsShowJobsList(false);
              } else {
                setIsShowLouis(false);
                setIsShowJobsList(true);
              }
            }}
          >
            <ButtonContent visible>Fichiers</ButtonContent>
            <ButtonContent hidden>
              <Icon name="file" fitted />
            </ButtonContent>
          </Button>

          {/* Config */}
          <Config />
        </div>
      </div>

      {/* Preview visu */}
      <PreviewDeco fileSelected={selectedFile} show={isShowPdf} />

      {/*  FolderFiles Files */}
      <LouisPreview show={isShowLouis} />

      {/* JobsList */}
      <JobsList show={isShowJobsList} formatTauro={formatTauro} />

      {/* InfoModal */}
      <InfoModal
        open={modalData.open}
        onClose={handleClose}
        message={modalData.message}
        object={modalData.object}
        error={modalData.error}
      />

      {/* FOOTER */}
      <Footer active={!isFooter} />
    </div>
  );
}

export default App;
