function GetProcess(props) {
  const { setIsProcessLoading, setIsFooter, setTimeProcess } = props;
  let update = {};
  fetch('http://localhost:8000/process', { method: 'GET', headers: { Accept: 'Application/json' } })
    .then((res) => res.json())
    .then((res) => {
      if (res.success) {
        update = { pdf: res.pdfTime, jpg: res.jpgTime };
        setIsProcessLoading(false);
        setIsFooter(true);
      } else {
        console.log('de la merde');
        GetProcess;
      }
      setTimeProcess((timeProcess) => ({ ...timeProcess, ...update }));
    })
    .catch((err) => console.log(err));
}

export default GetProcess;
