ScriptDir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )" # http://stackoverflow.com/a/246128/1867887

cd $ScriptDir
PORT=2370 node api.js