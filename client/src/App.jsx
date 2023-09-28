import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { Button, Form, Input } from 'semantic-ui-react';
import Header from './components/Header';
import Footer from './components/Footer';
import Loading from './components/Loading';
import PreviewDeco from './components/PreviewDeco';
import LouisPreview from './components/LouisPreview';
import FormatDropdown from './components/FormatDropdown';
import VisuelDropdown from './components/VisuelDropdown';
import ImageRender from './components/ImageRender';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(['']);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [files, setFiles] = useState(['']);
  const [isFile, setIsFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [loadCookie, setLoadCookie] = useState('');
  const [isProcessLoading, setIsProcessLoading] = useState(false);
  const [timeProcess, setTimeProcess] = useState({});
  const [isFooter, setIsFooter] = useState(false);
  const [isShowPdf, setIsShowPdf] = useState(false);
  const [isShowJpg, setIsShowJpg] = useState(false);
  const [isShowLouis, setIsShowLouis] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/path', {
      method: 'GET',
      headers: {
        Accept: 'Application/json',
      },
    })
      .then((res) => res.json())
      .then((res) => {
        setData(res.map((res) => res).slice(1, -4));
        setIsLoading(false);
        setIsFooter(false);
      })
      .catch((err) => console.log(err));
  }, []);

  const handleCookie = () => {
    const getCookie = Cookies.get('session');
    getCookie != undefined ? setLoadCookie(getCookie) : null;
  };
  useEffect(() => {
    handleCookie();
  }, []);

  const handleGetProcess = () => {
    let update = {};
    fetch('http://localhost:8000/process', { method: 'GET', headers: { Accept: 'Application/json' } })
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          update = { pdf: res.pdfTime, jpg: res.jpgTime, jpgPath: res.jpgPath };
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
      session: formData.get('session'),
      format: selectedFormat,
      visuel: selectedFile,
      numCmd: formData.get('numCmd'),
      ville: formData.get('ville'),
      ex: formData.get('ex'),
    };

    //POST data
    fetch('http://localhost:8000/', {
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

    //Set Cookies
    Cookies.set('session', data.session, { expires: 1 });

    // Hide view
    setIsShowPdf(false);
    setIsShowLouis(false);
    setIsShowJpg(false);

    //Set Loading Process
    setIsProcessLoading(true);

    //Check response
    handleGetProcess();
  };

  return (
    <>
      {/* LOADING */}
      <Loading active={isProcessLoading} />

      {/* Header Logo */}
      <Header />

      {/* Session Input */}
      <Form onSubmit={handleSubmit} className="form" widths="equal" error success>
        <Form.Field>
          <label htmlFor="session">Session du jour</label>
          <Input
            focus
            id="session"
            name="session"
            type="text"
            placeholder="PRINTSA#0000_08 AOUT"
            value={loadCookie}
            onChange={(e) => setLoadCookie(e.target.value)}
          />
        </Form.Field>

        {/* Format */}
        <Form.Field>
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
              setIsShowJpg(false);
            }}
          />
        </Form.Field>
        {/* Visu */}
        <Form.Field>
          <label htmlFor="visuel">Visuel</label>
          <VisuelDropdown
            id="visuel"
            className="visuel"
            isFile={isFile}
            files={files}
            value={selectedFile}
            selectedFile={selectedFile}
            onSelectedFile={(value) => {
              setSelectedFile(value);
              setIsShowPdf(true);
              setIsShowLouis(false);
              setIsShowJpg(false);
            }}
          />
        </Form.Field>

        {/* Infos commande */}
        <Form.Field>
          <label htmlFor="numCmd">N° commande</label>
          <Input id="numCmd" name="numCmd" type="number" placeholder="N° commande" />
        </Form.Field>
        <Form.Field>
          <label htmlFor="ville">Ville / Mag</label>
          <Input id="ville" name="ville" type="text" placeholder="Ville / Mag" />
        </Form.Field>
        <Form.Field>
          <label htmlFor="ex">Ex</label>
          <Input id="ex" name="ex" type="number" placeholder="Ex" />
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
              } else {
                setIsShowLouis(false);
                setIsShowPdf(true);
              }
            }}
          >
            Louis
          </Button>
        </div>
      </Form>

      {/* Preview visu */}
      <PreviewDeco fileSelected={selectedFile} show={isShowPdf} />

      {/* Preview Louis Files */}
      <LouisPreview show={isShowLouis} />

      {/* Preview Jpg */}
      <ImageRender active={isShowJpg} src={timeProcess.jpgPath} />

      {/* FOOTER */}
      <Footer active={!isFooter} timePdf={timeProcess.pdf} timeJpg={timeProcess.jpg} />
    </>
  );
}

export default App;
