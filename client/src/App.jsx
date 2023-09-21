import { useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { Button, Dimmer, Dropdown, Embed, Form, Image, Input, Loader } from 'semantic-ui-react'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState([])
  const [selectedFormat, setSelectedFormat] = useState('')
  const [files, setFiles] = useState([])
  const [isFile, setIsFile] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')
  const [loadCookie, setLoadCookie] = useState('')
  const [isProcess, setIsProcess] = useState(false)
  const [timeProcess, setTimeProcess] = useState({})
  const [isFooter, setIsFooter] = useState(false)



  useEffect(() => {
    const getCookie = Cookies.get('session')
    setLoadCookie(getCookie)
  },[])

  useEffect(() => {
    fetch("http://localhost:8000/path", {
    method: "GET",
    headers: {
      'Accept': 'Application/json'
    }
  })
      .then(res => res.json())
      .then(res => {
        setData(res.map(res => res).slice(1, -4))
        setIsLoading(false)
        setIsFooter(false)
      })
      .catch(err => console.log(err))  
  },[])


  const handleFooter = () => {
    if (!isFooter) {
     return (<div className="footer">
          <h4>deco-k-in.com</h4>
          <p>Panneau mural décoratif - Tel : +33 (0)3 20 68 99 70<br />
          14, rue du Haut de la Cruppe 59650 VILLENEUVE D&apos;ASCQ France</p>
          </div>
          )} else {
          return (<div className="footer">
            <p>Pdf completed: {timeProcess.pdf} secs - Jpg completed: {timeProcess.jpg} secs.</p>
          </div>
          )}
  }

  const getProcess = () => {
    let update = {}

     fetch("http://localhost:8000/process",{ method: "GET", headers: {'Accept': 'Application/json'}})
     .then(res => res.json())
      .then(res => {
       if (res.success) {
         update = { pdf: res.pdfTime, jpg: res.jpgTime }
           setIsProcess(false)
           setIsFooter(true)
        } else {
          getProcess()
       }
       setTimeProcess(timeProcess => ({ ...timeProcess, ...update }))
       
      })
      .catch(err => console.log(err))  
  }

  const PreviewDeco = () => {
   if(selectedFile) {
     return <Embed
    active={!isProcess}
    url={'http://localhost:8000/public/' + selectedFile.split('/').slice(1).join('/') }
    />
   } else {
    return ''
   }
  }

  const formatOptions =  data.map((format, index) => ({
    text: format.name,
    value: format.path,
    key: index
  })) 

  const filesOptions = files.map((file, index) => ({
        text: file.split('-').pop(),
        value: file,
        key: index,
    }))


    // Submit form
    const handleSubmit = (e) => {
      e.preventDefault()
      const form = e.target
      const formData = new FormData(form)
      const data = {
         session: formData.get("session"),
         format: selectedFormat,
         visuel: selectedFile,
         numCmd: formData.get("numCmd"),
         ville: formData.get("ville"),
         ex: formData.get("ex")
      }
      //POST data
      fetch('http://localhost:8000/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)})
      .then(res => res.json())
      .then(res => res)

      // Reset form
      form.reset()
      setFiles([])
      setIsFile(false)
      setSelectedFile('')

      //Set Cookies
      Cookies.set('session', data.session, { expires: 1 })

      //Set spinner
      setIsProcess(true)

      //Check response
      getProcess()
    }


  return (
      <div>
           {/* LOADING */}
        <Dimmer active={isProcess}>
        <Loader indeterminate size='massive' inline='centered'>En cours de créa ❤️</Loader>
      </Dimmer>

        {/* Header Logo */}
        <div className='header'>
          <Image src="https://www.deco-k-in.com/img/591408-logo-1495012906.jpg"/>
        </div>

        {/* Session Input */}
          <Form onSubmit={handleSubmit}>
            <label htmlFor="session">Session du jour</label>
          <Input focus id="session" name="session" type='text' placeholder='PRINTSA#0000_08 AOUT'
          value={loadCookie}
          onChange={e => setLoadCookie(e.target.value)}
          />


           {/* Format */}
           <label htmlFor="format">Format</label>
           <Dropdown id='format' className="format" floating selection placeholder='Format' options={formatOptions}
          onChange={(e, v) => {
              const value = isLoading ? 'Loading..' : data.find(x => x.path === v.value)
              setSelectedFormat(value.name)
              setFiles(value.files)
              setIsFile(true)
              setIsFooter(false)
          }}/>

        {/* Visu */}
        <label htmlFor="visuel">Visuel</label>
        <Dropdown 
        id='visuel' className="visuel"  header={selectedFormat} placeholder="Visuel" fluid search selection options={filesOptions}
        onChange={(e, data) => {
          const value = isFile ? data.value : data.placeholder
          setSelectedFile(value)
        }}/>
        
        {/* Infos commande */}
        <label htmlFor="numCmd">N° commande</label>
        <Input  id="numCmd" name="numCmd" type='number' placeholder='N° commande'/>
        <label htmlFor="ville">Ville / Mag</label>
        <Input  id="ville" name="ville" type='text' placeholder='Ville / Mag'/>
        <label htmlFor="ex">Ex</label>
        <Input  id="ex" name='ex' type='number' placeholder='Ex'/>
        <Button primary inverted type='submit'>Valider</Button>
        </Form>

         {/* Preview visu */}
         <div className='preview-deco'>
         <PreviewDeco />
         </div>
         {handleFooter()}
    </div>
  )
}

export default App
