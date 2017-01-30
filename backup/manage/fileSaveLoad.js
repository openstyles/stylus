var STYLISH_DUMPFILE_EXTENSION = ".json";

var saveButton = document.getElementById("file-all-styles"),
    loadButton = document.getElementById("unfile-all-styles");

saveButton.addEventListener('click', onSaveToFileClick);
loadButton.addEventListener('click', onLoadFromFileClick);

function onSaveToFileClick(){
    chrome.permissions.request({permissions: ['downloads']}, function(granted){
        if (granted){
            getStyles({}, function(styles){
                var text = JSON.stringify(styles);
                saveAsFile(text, generateFileName());
            });
        }
    })
}

function onLoadFromFileClick(){
    loadFromFile(STYLISH_DUMPFILE_EXTENSION).then(function(rawText){
        var json = JSON.parse(rawText);

        var i = 0, nextStyle;

        function proceed(){
            nextStyle = json[i++];
            if (nextStyle) {
                saveStyle(nextStyle, proceed);
            }else{
                i--;
                done();
            }
        }

        function done(){
            alert(i + " styles installed/updated");
            location.reload();
        }

        proceed();
    });
}

function generateFileName(){
    return "stylish-" + moment().format("MM-DD-YYYY") + STYLISH_DUMPFILE_EXTENSION;
}
