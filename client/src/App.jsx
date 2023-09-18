import { useEffect, useState } from 'react'
import { Button, Container, Dropdown, Embed, Form, Image, Input } from 'semantic-ui-react'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState([])
  const [selectedFormat, setSelectedFormat] = useState('')
  const [files, setFiles] = useState([])
  const [isFile, setIsFile] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')

  useEffect(() => {
    fetch("http://localhost:8000/path", {
    method: "GET",
    headers: {
      'Accept': 'Application/json'
    }
  })
      .then(response => response.json())
      .then(json => {
        setData(json.map(json => json).slice(1, -4))
        setIsLoading(false)
      })
      .catch(err => console.log(err))  
  },[])

  const PreviewDeco = () => {
   if(selectedFile) {
    return <Embed
    active
    url={'http://localhost:8000/public/' + selectedFile.split('/').slice(1).join('/') + '#toolbar=0&navpanes=0&scrollbar=0"'}
    />
   }
   return ''
  }
  
  const flagName = (value) => {
    if(value !== undefined) {
      let a = value.split('/').pop()
      let b = a.split('-')[1].split('').slice(0, 3).join('')
      return b
    } else {
      return ''
    }
  }

  const formatOptions =  data.map((format, index) => ({
    text: format.name,
    value: format.path,
    key: index
  })) 

  const filesOptions = files.map((file) => ({
        text: file.split('-').pop(),
        value: file,
        key: flagName(file),
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
      form.reset()
      fetch('http://localhost:8000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(res => res.json())
      .then(res => res)
    }


  return (
      <div className='main-container'>

        {/* Header Logo */}
        <Container className='logo'>
          <Image src="https://www.deco-k-in.com/img/591408-logo-1495012906.jpg"/>
        </Container>

        {/* Session Input */}
        <Container>
          <Form onSubmit={handleSubmit}>
            <label htmlFor="session">Session du jour</label>
          <Input focus id="session" name="session" type='text' placeholder='PRINTSA#0000_08 AOUT'/>


           {/* Format */}
           <label htmlFor="format">Format</label>
           <Dropdown className="format" floating selection placeholder='Format' options={formatOptions}
          onChange={(e, v) => {
              const value = isLoading ? 'Loading..' : data.find(x => x.path === v.value)
              setSelectedFormat(value.name)
              setFiles(value.files)
              setIsFile(true)
          }}/>

        {/* Visu */}
        <label htmlFor="visuel">Visuel</label>
        <Dropdown 
        className="visuel" placeholder='Visuel'fluid search selection options={filesOptions}
        onChange={(e, data) => {
          const value = isFile ? data.value : ''
          setSelectedFile(value)
          console.log(selectedFile.split('/').slice(1).join('/'))
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
        <div  className='preview-deco'>
          <Container>
          <PreviewDeco />
          </Container>

        </div>
        </Container>
    </div>
  )
}

export default App
